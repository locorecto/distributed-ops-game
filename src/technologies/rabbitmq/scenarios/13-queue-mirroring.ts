import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-13-queue-mirroring',
  index: 13,
  title: 'Mirror Queue Split',
  subtitle: 'Medium-Hard · Classic Mirrored Queues',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['ha-mode', 'classic-mirrored-queues', 'mirror-sync', 'ha-sync-mode', 'slave-promotion'],

  briefing: {
    story:
      "An order processing queue uses classic mirrored queues with ha-mode: all, ha-sync-mode: manual. When broker-2 (a mirror) restarted after a crash, it joined unsynchronized. Consumers on broker-2 started receiving stale messages from 6 hours ago — the unsynchronized mirror had an older snapshot. 3,000 orders were processed twice.",
    symptom:
      'broker-2 rejoined the cluster with an out-of-date mirror snapshot. Because ha-sync-mode is set to manual, the mirror was never brought up to date before consumers were routed to it. Duplicate message delivery is causing double-processing of orders.',
    goal:
      'Force-synchronize the mirror on broker-2, switch ha-sync-mode to automatic so future restarts sync before promoting, and restore system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The mirror on broker-2 is unsynchronized. Run 'force-mirror-sync' to bring it up to date with the master before any consumers are routed to it.",
        relatedConcept: 'mirror-sync',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Set ha-sync-mode to 'automatic' so RabbitMQ automatically synchronizes new mirrors before they become eligible to serve consumers. This prevents stale mirrors from being promoted.",
        relatedConcept: 'ha-sync-mode',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: "Consider upgrading this queue to a quorum queue. Quorum queues use Raft consensus which eliminates the concept of unsynchronized mirrors entirely — all replicas receive every write before it is confirmed.",
        relatedConcept: 'slave-promotion',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@broker-1', maxMemoryMb: 4096, minDiskFreeMb: 1000, maxConnections: 1000 },
      { id: 'rabbit@broker-2', maxMemoryMb: 4096, minDiskFreeMb: 1000, maxConnections: 1000 },
      { id: 'rabbit@broker-3', maxMemoryMb: 4096, minDiskFreeMb: 1000, maxConnections: 1000 },
    ],
    exchanges: [
      { name: 'orders', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'orders.processing',
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
    ],
    bindings: [
      { exchange: 'orders', queue: 'orders.processing', routingKey: 'order.created' },
    ],
    publishers: [
      {
        id: 'publisher-orders',
        targetExchange: 'orders',
        routingKey: 'order.created',
        messagesPerSecond: 500,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-processor-1',
        queue: 'orders.processing',
        prefetchCount: 50,
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
      {
        id: 'consumer-processor-2',
        queue: 'orders.processing',
        prefetchCount: 50,
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 5, type: 'node-restart', target: 'rabbit@broker-2', params: { unsynchronizedRejoIn: true } },
    { atTick: 8, type: 'duplicate-delivery', target: 'orders.processing', params: { duplicateCount: 3000 } },
  ],

  victoryConditions: [
    {
      id: 'mirror-synced',
      description: 'Mirror on broker-2 is fully synchronized',
      required: true,
      check: s => s.activeFailures.length === 0,
    },
    {
      id: 'health-restored',
      description: 'System health score above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'ha-sync-mode',
      title: 'HA Sync Mode',
      body: "With ha-sync-mode: manual (the default), when a mirror restarts and rejoins the cluster it is NOT synchronized — it holds whatever state it had when it crashed. If the master promotes this stale mirror, consumers receive duplicate or stale messages. Setting ha-sync-mode: automatic forces RabbitMQ to fully sync the mirror before it becomes active, at the cost of blocking publishes during synchronization on busy queues.",
      showWhenFixed: true,
    },
    {
      concept: 'classic-mirrored-queues',
      title: 'Classic Mirrored Queues (Deprecated)',
      body: "Classic mirrored queues were the HA mechanism prior to RabbitMQ 3.8. They have known edge cases around synchronization and are deprecated in favour of quorum queues, which use Raft consensus to guarantee that every write is replicated to a majority of nodes before being confirmed — eliminating the stale-mirror problem entirely.",
      showWhenFixed: false,
    },
    {
      concept: 'slave-promotion',
      title: 'Mirror Promotion',
      body: "When the master node of a classic mirrored queue fails, RabbitMQ promotes one of the mirrors (slaves) to master. If that mirror was unsynchronized, messages written after the last sync point are permanently lost. Always use ha-sync-mode: automatic or migrate to quorum queues to avoid this data-loss window.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-ha-sync-mode-automatic',
    'force-mirror-sync',
    'upgrade-to-quorum-queue',
  ],
}

export default scenario
