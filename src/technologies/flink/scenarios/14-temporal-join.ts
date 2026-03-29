import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-temporal-join',
  index: 14,
  title: 'Unbounded Stream-Stream Join',
  subtitle: 'Medium-Hard · Temporal Joins',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['temporal-join', 'stream-join', 'versioned-table', 'state-retention'],

  briefing: {
    story:
      'The order enrichment job joins order events with a product dimension stream. The join has no temporal bounds — every order event is compared with every product event ever received. After 3 days of operation, state has grown to 800 GB and the job is failing with OOM errors.',
    symptom:
      'heapPressure approaching 0.95. stateSize for the join operator growing without bound. Job OOMing every 12 hours.',
    goal:
      'Replace the unbounded join with an event-time temporal join using a versioned table. Bring heapPressure below 0.6 and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Convert the product stream to a versioned table using FOR SYSTEM_TIME AS OF. This stores only the latest version of each product key plus a configurable retention window — not every historical record.',
        relatedConcept: 'versioned-table',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'In Flink SQL: SELECT o.*, p.name FROM orders AS o LEFT JOIN products FOR SYSTEM_TIME AS OF o.event_time AS p ON o.product_id = p.id. The "FOR SYSTEM_TIME AS OF" clause bounds the join to the dimension state at the order\'s event time.',
        relatedConcept: 'temporal-join',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-orders',
        name: 'Order Source',
        parallelism: 8,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'source-products',
        name: 'Product Dimension Source',
        parallelism: 2,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'join-order-product',
        name: 'Stream-Stream Join (unbounded)',
        parallelism: 8,
        type: 'aggregate',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'sink-enriched',
        name: 'Enriched Orders Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 30000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 10, maxHeapMb: 8192 },
      { id: 'tm-2', slots: 10, maxHeapMb: 8192 },
      { id: 'tm-3', slots: 10, maxHeapMb: 8192 },
    ],
    checkpointIntervalMs: 30000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'state-backend-oom',
      target: 'join-order-product',
      params: { stateSizeMb: 819200, reason: 'unbounded-stream-join-state' },
    },
  ],

  victoryConditions: [
    {
      id: 'heap-ok',
      description: 'Heap pressure below 0.6',
      required: true,
      check: s => s.metrics.heapPressure < 0.6,
    },
    {
      id: 'health-good',
      description: 'System health above 80%',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'temporal-join',
      title: 'Temporal Joins',
      body: 'A temporal join enriches a stream with the dimension table version that was current at the event\'s time. Unlike a regular stream join, it does not buffer both sides indefinitely — the dimension side is stored as a versioned snapshot with bounded retention.',
      showWhenFixed: true,
    },
    {
      concept: 'versioned-table',
      title: 'Versioned Tables',
      body: 'A versioned table in Flink SQL tracks the full history of each key with system-time versioning. When combined with a temporal join, only the relevant historical window needs to be retained — dramatically reducing state size compared to buffering both streams.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'configure-temporal-join',
    'set-versioned-table',
    'set-state-retention',
    'configure-join-bounds',
  ],
}

export default scenario
