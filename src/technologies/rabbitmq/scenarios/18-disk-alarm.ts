import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-18-disk-alarm',
  index: 18,
  title: 'Disk Free Alarm Lockout',
  subtitle: 'Hard · Disk Alarm',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['disk_free_limit', 'disk-alarm', 'persistent-messages', 'publish-blocking', 'dead-queue-cleanup'],

  briefing: {
    story:
      "A persistent message queue accumulated 2M unprocessed messages (8GB) when the consumer service went down for 3 days. Disk free space dropped below disk_free_limit (1GB). RabbitMQ blocked all publishers. The consumer is back but can't reconnect because the publish block is preventing AMQP setup frames too.",
    symptom:
      "Disk free is 400MB, below disk_free_limit of 1GB. RabbitMQ has blocked all connections that have sent publish frames. The returning consumer is unable to open a channel because the TCP connection is being blocked at the AMQP level before it can declare its consume. The queue holds 2M messages consuming 8GB.",
    goal:
      'Purge old messages from the queue to free disk space, or temporarily increase disk_free_limit so the alarm clears, delete and recreate the queue if appropriate, and get the consumer reconnected. Restore disk free above 2GB and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The fastest recovery is to purge the queue: rabbitmqctl purge_queue orders.backlog. This immediately removes all 2M messages from memory and schedules the on-disk message store entries for deletion, freeing several GB of disk space within seconds.",
        relatedConcept: 'dead-queue-cleanup',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "If you can't afford to lose the messages, temporarily increase disk_free_limit to a smaller value to clear the alarm, then let the consumer drain the queue normally. Set: rabbitmqctl set_disk_free_limit 500000000 (500MB). WARNING: only do this if you have a plan to free real disk space.",
        relatedConcept: 'disk_free_limit',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Consider adding a message TTL or max-length-bytes to this queue to prevent unbounded growth in the future. When the consumer is absent for days, you need an overflow strategy — either DLX routing, TTL expiry, or max-length-bytes with reject-publish.",
        relatedConcept: 'persistent-messages',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node1', maxMemoryMb: 16384, minDiskFreeMb: 1024, maxConnections: 1000 },
    ],
    exchanges: [
      { name: 'orders', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'orders.backlog',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: true,
      },
    ],
    bindings: [
      { exchange: 'orders', queue: 'orders.backlog', routingKey: 'order.created' },
    ],
    publishers: [
      {
        id: 'publisher-checkout',
        targetExchange: 'orders',
        routingKey: 'order.created',
        messagesPerSecond: 1000,
        messageSizeBytes: 4096,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [],
  },

  failureScript: [
    { atTick: 1, type: 'disk-alarm', target: 'rabbit@node1', params: { diskFreeMb: 400, limitMb: 1024, queueDepth: 2000000, queueSizeGb: 8 } },
    { atTick: 2, type: 'publisher-blocked', target: 'publisher-checkout', params: { reason: 'disk-alarm' } },
    { atTick: 5, type: 'consumer-reconnect-blocked', target: 'orders.backlog', params: {} },
  ],

  victoryConditions: [
    {
      id: 'disk-alarm-cleared',
      description: 'Disk free above disk_free_limit',
      required: true,
      check: s => {
        for (const [, node] of s.nodes) {
          if (node.isDiskAlarm) return false
        }
        return true
      },
    },
    {
      id: 'consumer-connected',
      description: 'Consumer reconnected and processing messages',
      required: true,
      check: s => s.metrics.totalConsumeRate > 0,
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
      concept: 'disk_free_limit',
      title: 'Disk Free Limit',
      body: "disk_free_limit (default: 50MB, recommended: {mem_relative, 1.0} = 1× RAM) is the minimum free disk space RabbitMQ requires before it blocks all publishing. Unlike the memory alarm, the disk alarm blocks connections before they run out of disk — not after. The limit exists to ensure RabbitMQ always has space to persist messages safely and write Mnesia transaction logs.",
      showWhenFixed: true,
    },
    {
      concept: 'publish-blocking',
      title: 'Disk Alarm Blocks AMQP Setup',
      body: "A subtle but critical behaviour: the disk alarm blocks connections at the AMQP protocol level, not just publish operations. This means that even a new consumer connection may be blocked if it sends any frames that are considered 'write' operations during the alarm period. In practice, some AMQP clients timeout waiting for channel.open-ok and fail to establish consumers while the alarm is active.",
      showWhenFixed: false,
    },
    {
      concept: 'dead-queue-cleanup',
      title: 'Preventing Unbounded Queue Growth',
      body: "Queues without a max-length or TTL can grow until they exhaust disk. Best practices: set x-max-length-bytes to cap total queue size; set x-message-ttl to expire unprocessed messages after a reasonable period; configure a DLX so expired messages are captured rather than silently dropped; use lazy queues for large queues to write messages to disk immediately rather than accumulating in RAM.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'purge-old-messages',
    'increase-disk-limit',
    'delete-and-recreate-queue',
  ],
}

export default scenario
