import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-30-cross-protocol',
  index: 30,
  title: 'AMQP → MQTT Protocol Bridge',
  subtitle: 'Master · Cross-Protocol Messaging',
  difficulty: 'master',
  estimatedMinutes: 55,
  coverConcepts: ['rabbitmq-mqtt', 'AMQP-MQTT-bridge', 'QoS-levels', 'topic-mapping', 'protocol-translation'],

  briefing: {
    story:
      "10,000 IoT devices connect via MQTT (QoS 1) to RabbitMQ. Backend services consume via AMQP. The MQTT plugin maps topics to AMQP routing keys but the topic naming convention uses `/` separators (MQTT) while AMQP expects `.` — messages from `sensors/temperature/floor1` aren't reaching the AMQP exchange `sensors.temperature`. Additionally, QoS 2 devices are sending duplicate messages because the plugin is configured for QoS 1 maximum.",
    symptom:
      "Two distinct problems: (1) MQTT topic `sensors/temperature/floor1` maps to AMQP routing key `sensors/temperature/floor1` but the AMQP binding uses `sensors.temperature.floor1` — no messages match. The MQTT plugin does NOT automatically translate `/` to `.`. (2) QoS 2 MQTT devices are downgraded to QoS 1 by the broker, causing PUBLISH+PUBREL duplicate delivery to appear as duplicate messages in the AMQP queue.",
    goal:
      "Fix topic mapping by configuring the MQTT plugin's topic-to-routing-key translation (or update AMQP bindings to use `/` as separator), set max QoS to 2 in the MQTT plugin configuration, and verify 10,000 device messages are flowing correctly to AMQP consumers without duplicates.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Fix the topic separator mismatch. Option A: Configure mqtt_topic_translation in rabbitmq.conf to map '/' to '.' (mqtt_topic_to_routing_key.replace = [{\".\", \"/\"}, {\"/\", \".\"}]). Option B: Update AMQP bindings to use '/' as the routing key separator. Option A is less disruptive if you have many AMQP bindings already deployed.",
        relatedConcept: 'topic-mapping',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Set mqtt.max_qos to 2 in rabbitmq.conf: {rabbitmq_mqtt, [{max_qos, 2}]}. By default the plugin caps QoS at 1. With QoS 2, the broker participates in the 4-way PUBLISH/PUBREC/PUBREL/PUBCOMP handshake, guaranteeing exactly-once delivery from device to broker.",
        relatedConcept: 'QoS-levels',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Verify AMQP binding patterns after the topic mapping fix. Use the management UI's 'Test' feature on the exchange to confirm routing key 'sensors.temperature.floor1' (or 'sensors/temperature/floor1' with Option B) matches your consumer bindings. Also test with a wildcard: 'sensors.temperature.#' should match all floor sensors.",
        relatedConcept: 'AMQP-MQTT-bridge',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 32768, minDiskFreeMb: 8000, maxConnections: 15000 },
      { id: 'rabbit@node-2', maxMemoryMb: 32768, minDiskFreeMb: 8000, maxConnections: 15000 },
      { id: 'rabbit@node-3', maxMemoryMb: 32768, minDiskFreeMb: 8000, maxConnections: 15000 },
    ],
    exchanges: [
      { name: 'sensors.temperature', type: 'topic', durable: true, autoDelete: false },
      { name: 'sensors.humidity', type: 'topic', durable: true, autoDelete: false },
      { name: 'amq.topic', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'analytics.temperature',
        type: 'quorum',
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
      {
        name: 'analytics.humidity',
        type: 'quorum',
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
      {
        name: 'alerts.temperature',
        type: 'quorum',
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
      { exchange: 'sensors.temperature', queue: 'analytics.temperature', routingKey: 'sensors.temperature.#' },
      { exchange: 'sensors.humidity', queue: 'analytics.humidity', routingKey: 'sensors.humidity.#' },
      { exchange: 'sensors.temperature', queue: 'alerts.temperature', routingKey: 'sensors.temperature.floor1' },
    ],
    publishers: [
      {
        id: 'publisher-mqtt-devices',
        targetExchange: 'amq.topic',
        routingKey: 'sensors/temperature/floor1',
        messagesPerSecond: 10000,
        messageSizeBytes: 256,
        confirmMode: false,
        persistent: false,
      },
    ],
    consumers: [
      {
        id: 'consumer-analytics-service',
        queue: 'analytics.temperature',
        prefetchCount: 5000,
        ackMode: 'auto',
        processingTimeMs: 1,
        errorRate: 0,
      },
      {
        id: 'consumer-alerting-service',
        queue: 'alerts.temperature',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 10,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'mqtt-topic-mismatch', target: 'publisher-mqtt-devices', params: { mqttSeparator: '/', amqpSeparator: '.', routingKeyUsed: 'sensors/temperature/floor1', routingKeyExpected: 'sensors.temperature.floor1' } },
    { atTick: 2, type: 'qos-downgrade', target: 'publisher-mqtt-devices', params: { deviceQoS: 2, brokerMaxQoS: 1, duplicatesPerMinute: 300 } },
    { atTick: 3, type: 'messages-unrouted', target: 'analytics.temperature', params: { unroutedRate: 10000 } },
  ],

  victoryConditions: [
    {
      id: 'topic-mapping-fixed',
      description: 'MQTT topic separator correctly translated to AMQP routing key',
      required: true,
      check: s => !s.activeFailures.includes('mqtt-topic-mismatch'),
    },
    {
      id: 'qos2-enabled',
      description: 'QoS 2 supported — no duplicate messages',
      required: true,
      check: s => !s.activeFailures.includes('qos-downgrade'),
    },
    {
      id: 'messages-flowing',
      description: 'All 10,000 device messages reaching AMQP consumers',
      required: true,
      check: s => s.metrics.totalConsumeRate > 9000,
    },
    {
      id: 'health-good',
      description: 'System health score above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'topic-mapping',
      title: 'MQTT Topic to AMQP Routing Key Mapping',
      body: "The RabbitMQ MQTT plugin translates MQTT topics to AMQP routing keys by replacing '/' with '.'. For example, 'sensors/temperature/floor1' becomes 'sensors.temperature.floor1'. MQTT wildcards also translate: '+' (single level) → '*', '#' (multi-level) → '#'. This translation happens automatically in recent versions — check your plugin version if you're seeing raw '/' characters in routing keys.",
      showWhenFixed: true,
    },
    {
      concept: 'QoS-levels',
      title: 'MQTT QoS Levels',
      body: "MQTT defines 3 Quality of Service levels: QoS 0 (at most once, fire and forget), QoS 1 (at least once, requires PUBACK), QoS 2 (exactly once, requires 4-way PUBLISH/PUBREC/PUBREL/PUBCOMP handshake). The RabbitMQ MQTT plugin defaults to max_qos: 1. Devices requesting QoS 2 are silently downgraded to QoS 1, meaning the broker may deliver duplicate messages if PUBACK is lost.",
      showWhenFixed: false,
    },
    {
      concept: 'AMQP-MQTT-bridge',
      title: 'AMQP ↔ MQTT Bridging Architecture',
      body: "The RabbitMQ MQTT plugin creates a bridge between MQTT and AMQP by internally treating MQTT connections as AMQP connections. MQTT QoS 0 maps to non-persistent AMQP messages. QoS 1/2 map to persistent messages. MQTT subscriptions create AMQP queues with the topic as routing key. This allows MQTT IoT devices and AMQP backend services to exchange messages transparently through the same broker.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'configure-mqtt-topic-mapping',
    'set-max-qos-level',
    'verify-amqp-binding-pattern',
  ],
}

export default scenario
