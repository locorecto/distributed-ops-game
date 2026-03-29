import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-lazy-queue',
  index: 11,
  title: 'RAM Exhaustion from Classic Queue',
  subtitle: 'Medium-Hard · Lazy Queues',
  difficulty: 'medium-hard',
  estimatedMinutes: 15,
  coverConcepts: ['lazy-queue', 'memory-watermark', 'classic-queue', 'disk-vs-memory'],

  briefing: {
    story:
      "ArchiveService holds 50 million historical event messages in a classic RabbitMQ queue. All messages are kept in RAM by default. The broker's memory footprint has reached 12GB — and the max is 16GB. With the memory watermark at 40%, a memory alarm is imminent. When it triggers, ALL publishers will be blocked and the system will freeze.",
    symptom:
      "Classic queue holds 50M messages entirely in RAM. Memory usage at 75% and climbing. Memory alarm will fire at 40% watermark (~6.4GB), which was crossed long ago — system is actually already in alarm state. All publishers are blocked.",
    goal:
      'Enable lazy mode on the archive queue to move messages to disk. Reduce memory usage ratio below 0.7 and restore health above 80. Publishers must be unblocked.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Classic queues keep all messages in RAM for fast access. With 50M messages, this exhausts available memory. Enable 'lazy mode' (x-queue-mode=lazy) to store messages on disk, only loading them into RAM when consumers request them.",
        relatedConcept: 'lazy-queue',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Set lazyMode=true on the 'archive' queue. Also consider setting the memory watermark lower (vm_memory_high_watermark=0.3) to give earlier warning before the alarm triggers. This will unblock publishers and reduce RAM usage.",
        relatedConcept: 'memory-watermark',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 16384, minDiskFreeMb: 1000, maxConnections: 1000 }],
    exchanges: [
      { name: 'events', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'archive',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,  // BUG: not lazy — keeps all messages in RAM
      },
    ],
    bindings: [
      { exchange: 'events', queue: 'archive', routingKey: 'event.#' },
    ],
    publishers: [
      {
        id: 'publisher-events',
        targetExchange: 'events',
        routingKey: 'event.system',
        messagesPerSecond: 5000,
        messageSizeBytes: 2048,
        confirmMode: false,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-archiver',
        queue: 'archive',
        prefetchCount: 500,
        ackMode: 'auto',
        processingTimeMs: 1,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    // At tick 5, memory alarm fires — pre-loaded with large queue depth
    { atTick: 3, type: 'queue-overflow', target: 'archive', params: { messages: 50000000 } },
    { atTick: 5, type: 'memory-alarm', target: 'rabbit@node1', params: {} },
  ],

  victoryConditions: [
    {
      id: 'memory-low',
      description: 'Memory usage ratio below 0.7',
      required: true,
      check: s => s.metrics.memoryUsageRatio < 0.7,
    },
    {
      id: 'health-good',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'lazy-queue',
      title: 'Lazy Queues',
      body: "Classic RabbitMQ queues try to keep all messages in RAM for maximum throughput. Lazy queues (x-queue-mode=lazy) write messages to disk as soon as they're published, only loading them into RAM when consumers request them. This dramatically reduces memory usage for deep queues but slightly increases latency. Essential for queues that accumulate large backlogs.",
      showWhenFixed: true,
    },
    {
      concept: 'memory-watermark',
      title: 'Memory Watermark',
      body: "RabbitMQ triggers a memory alarm when RAM usage exceeds vm_memory_high_watermark (default 40% of system RAM). When the alarm fires, ALL publishers on ALL connections are blocked — not just the problematic queue's publishers. This is a broker-wide protection mechanism. Lazy queues + lower watermark (0.3) provide defense in depth.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'enable-lazy-mode',
    'set-memory-watermark',
    'purge-queue',
    'set-queue-type',
  ],
}

export default scenario
