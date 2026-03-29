import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-26-stream-queue',
  index: 26,
  title: 'Stream Queue Retention Crisis',
  subtitle: 'Expert · RabbitMQ Streams',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['rabbitmq-streams', 'stream-retention', 'max-age', 'max-segment-size', 'publisher-offset-tracking'],

  briefing: {
    story:
      "A RabbitMQ Stream queue receiving IoT sensor data at 1M msg/sec has no retention policy configured. After 48 hours, the stream has consumed 2TB of disk — the broker is now rejecting all publishes due to disk alarm. Consumers can replay from any offset but new data can't be ingested.",
    symptom:
      "The IoT stream queue 'sensors.readings' has grown to 2TB over 48 hours with no max-age or max-length-bytes configured. Disk free space is below disk_free_limit. RabbitMQ is blocking all publishers. IoT device data is being lost because devices can't buffer more than 60 seconds of readings locally.",
    goal:
      'Apply a retention policy (max-age: 24h or max-length-bytes: 500GB) to the stream to trigger segment deletion, clear the disk alarm, and restore ingestion. Verify consumers can continue reading from their last confirmed offset without replaying deleted data.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Apply max-age retention immediately via policy: rabbitmqctl set_policy iot-retention \"^sensors\\\\.\" '{\"max-age\":\"24h\"}' --apply-to queues. RabbitMQ will begin deleting segments older than 24 hours, freeing disk space within minutes.",
        relatedConcept: 'max-age',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Also set max-length-bytes as a size cap: '{\"max-length-bytes\":536870912000}' (500GB). This provides a hard size limit independent of time, protecting against unexpected high-volume periods. Use both max-age AND max-length-bytes — whichever triggers first wins.",
        relatedConcept: 'stream-retention',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Check consumer offset tracking. If consumers were reading near the tail of the stream (recent data), their saved offsets should still be valid after deletion of old segments. If a consumer's offset falls within a deleted segment, it will automatically be advanced to the first available offset — verify this behaviour in your client library.",
        relatedConcept: 'publisher-offset-tracking',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 32768, minDiskFreeMb: 10240, maxConnections: 2000 },
      { id: 'rabbit@node-2', maxMemoryMb: 32768, minDiskFreeMb: 10240, maxConnections: 2000 },
      { id: 'rabbit@node-3', maxMemoryMb: 32768, minDiskFreeMb: 10240, maxConnections: 2000 },
    ],
    exchanges: [
      { name: 'sensors', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'sensors.readings',
        type: 'stream',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'sensors', queue: 'sensors.readings', routingKey: 'sensor.#' },
    ],
    publishers: [
      {
        id: 'publisher-iot-devices',
        targetExchange: 'sensors',
        routingKey: 'sensor.reading',
        messagesPerSecond: 1000000,
        messageSizeBytes: 128,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-analytics',
        queue: 'sensors.readings',
        prefetchCount: 10000,
        ackMode: 'auto',
        processingTimeMs: 1,
        errorRate: 0,
      },
      {
        id: 'consumer-alerting',
        queue: 'sensors.readings',
        prefetchCount: 1000,
        ackMode: 'auto',
        processingTimeMs: 2,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'stream-no-retention', target: 'sensors.readings', params: { sizeGb: 2048, ageHours: 48 } },
    { atTick: 2, type: 'disk-alarm', target: 'rabbit@node-1', params: { diskFreeMb: 200, limitMb: 10240 } },
    { atTick: 2, type: 'disk-alarm', target: 'rabbit@node-2', params: { diskFreeMb: 150, limitMb: 10240 } },
    { atTick: 3, type: 'publisher-blocked', target: 'publisher-iot-devices', params: { reason: 'disk-alarm' } },
  ],

  victoryConditions: [
    {
      id: 'retention-configured',
      description: 'Stream has a retention policy configured',
      required: true,
      check: s => !s.activeFailures.includes('stream-no-retention'),
    },
    {
      id: 'disk-alarm-cleared',
      description: 'Disk alarm cleared on all nodes',
      required: true,
      check: s => {
        for (const [, node] of s.nodes) {
          if (node.isDiskAlarm) return false
        }
        return true
      },
    },
    {
      id: 'ingestion-restored',
      description: 'IoT data ingestion restored',
      required: true,
      check: s => s.metrics.totalPublishRate > 900000,
    },
  ],

  conceptCards: [
    {
      concept: 'stream-retention',
      title: 'Stream Queue Retention Policies',
      body: "RabbitMQ Streams store data in immutable segments on disk. Without a retention policy, segments are never deleted and the stream grows indefinitely. Two retention settings are available: max-age (delete segments older than a duration, e.g. '24h', '7D') and max-length-bytes (delete oldest segments when total size exceeds limit). Both can be combined — the first to trigger wins. Apply them at creation time or via policy.",
      showWhenFixed: true,
    },
    {
      concept: 'max-age',
      title: 'Time-Based Stream Retention',
      body: "max-age uses duration strings: Y (years), M (months), D (days), h (hours), m (minutes), s (seconds). Examples: '7D', '24h', '30m'. Segment deletion happens at segment boundaries — a segment is only deleted when all messages in it are older than max-age. This means retention is approximate: actual data may be kept slightly longer than specified.",
      showWhenFixed: false,
    },
    {
      concept: 'publisher-offset-tracking',
      title: 'Consumer Offset Tracking',
      body: "Stream consumers track their position using offsets. RabbitMQ can store named consumer offsets server-side. When segments are deleted due to retention policies, consumer offsets that fall within deleted segments are automatically advanced to the first available message. This means consumers never receive an error due to segment deletion — they simply skip to available data.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-max-age-retention',
    'set-max-length-bytes',
    'purge-and-reconfigure-stream',
  ],
}

export default scenario
