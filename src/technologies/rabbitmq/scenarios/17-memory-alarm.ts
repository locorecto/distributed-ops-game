import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-17-memory-alarm',
  index: 17,
  title: 'Publisher Block Storm',
  subtitle: 'Hard · Memory Alarm',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['vm_memory_high_watermark', 'publisher-blocking', 'connection-blocking', 'memory-alarm', 'flow-control'],

  briefing: {
    story:
      "A batch import job published 10M large messages (50KB each) in 30 seconds. RabbitMQ hit the memory watermark (40% of 8GB RAM) and started blocking all publishers — including the payment service which has nothing to do with the batch job. The `vm_memory_high_watermark` is too low. Publishers are blocked for 8 minutes.",
    symptom:
      "vm_memory_high_watermark is set to 0.4 (40% of 8GB = 3.2GB). The batch import consumed 3.4GB in 30 seconds, triggering the memory alarm. RabbitMQ immediately blocked ALL connections with writes pending — including the payment service. Connection-level blocking is not selective; it applies globally.",
    goal:
      'Raise vm_memory_high_watermark to 0.6 to give more headroom, add publisher confirms with exponential backoff to the batch job so it self-throttles, and enable per-connection flow control. Unblock the payment service and restore health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Raise the memory watermark dynamically without restarting: rabbitmqctl set_vm_memory_high_watermark 0.6. This gives the broker more memory headroom before triggering the alarm. Be cautious — setting it too high risks OOM.",
        relatedConcept: 'vm_memory_high_watermark',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "The real fix is in the batch publisher: add publisher confirms with exponential backoff. When the broker is under pressure, confirms will be slow — the publisher should back off instead of flooding. This prevents the memory spike in the first place.",
        relatedConcept: 'publisher-blocking',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Consider splitting critical publishers (payments) and bulk publishers (batch import) into separate vhosts or even separate brokers. Bulk jobs should never share infrastructure with latency-sensitive services — a memory alarm on one affects all.",
        relatedConcept: 'flow-control',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node1', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
    ],
    exchanges: [
      { name: 'batch', type: 'direct', durable: true, autoDelete: false },
      { name: 'payments', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'batch.import',
        type: 'classic',
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
        name: 'payments.transactions',
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
      { exchange: 'batch', queue: 'batch.import', routingKey: 'import' },
      { exchange: 'payments', queue: 'payments.transactions', routingKey: 'txn' },
    ],
    publishers: [
      {
        id: 'publisher-batch-import',
        targetExchange: 'batch',
        routingKey: 'import',
        messagesPerSecond: 333333,
        messageSizeBytes: 51200,
        confirmMode: false,
        persistent: true,
      },
      {
        id: 'publisher-payment-service',
        targetExchange: 'payments',
        routingKey: 'txn',
        messagesPerSecond: 500,
        messageSizeBytes: 512,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-batch-worker',
        queue: 'batch.import',
        prefetchCount: 10,
        ackMode: 'manual',
        processingTimeMs: 100,
        errorRate: 0,
      },
      {
        id: 'consumer-payment-processor',
        queue: 'payments.transactions',
        prefetchCount: 50,
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'memory-alarm', target: 'rabbit@node1', params: { watermark: 0.4, usageMb: 3400 } },
    { atTick: 4, type: 'publisher-blocked', target: 'publisher-payment-service', params: { reason: 'memory-alarm' } },
    { atTick: 4, type: 'publisher-blocked', target: 'publisher-batch-import', params: { reason: 'memory-alarm' } },
  ],

  victoryConditions: [
    {
      id: 'payment-publisher-unblocked',
      description: 'Payment service publisher unblocked',
      required: true,
      check: s => {
        const p = s.publishers.get('publisher-payment-service')
        return p !== undefined && !p.blocked
      },
    },
    {
      id: 'memory-alarm-cleared',
      description: 'Memory alarm cleared',
      required: true,
      check: s => s.metrics.memoryUsageRatio < 0.6,
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
      concept: 'vm_memory_high_watermark',
      title: 'Memory High Watermark',
      body: "vm_memory_high_watermark (default 0.4) defines the fraction of total RAM at which RabbitMQ triggers a memory alarm and blocks all publishing connections. It is a single global threshold — there is no per-vhost or per-queue setting. Raising it gives more headroom but risks the OS killing the broker with OOM. A better long-term solution is separating bulk and latency-sensitive workloads.",
      showWhenFixed: true,
    },
    {
      concept: 'connection-blocking',
      title: 'Connection-Level Blocking',
      body: "When a memory or disk alarm fires, RabbitMQ sends an AMQP 'connection.blocked' notification to every connection that has published a message recently. The connection is then blocked for writes until the alarm clears. This is not selective — a critical payment service and a batch import job are blocked equally. Applications must handle connection.blocked gracefully with timeouts and circuit breakers.",
      showWhenFixed: false,
    },
    {
      concept: 'publisher-blocking',
      title: 'Publisher Confirms with Backoff',
      body: "Publisher confirms (basic.ack / basic.nack) provide flow control through backpressure: when the broker is slow to confirm, the publisher knows to slow down. Combining confirms with exponential backoff means a batch publisher automatically throttles itself when the broker is under pressure, preventing memory spikes before the alarm triggers.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'raise-memory-watermark',
    'enable-per-connection-flow-control',
    'add-publisher-confirms-with-backoff',
  ],
}

export default scenario
