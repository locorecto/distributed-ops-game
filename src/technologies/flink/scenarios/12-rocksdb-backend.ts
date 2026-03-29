import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-rocksdb-backend',
  index: 12,
  title: 'Heap State Backend OOM — 100 GB State',
  subtitle: 'Medium-Hard · State Backends',
  difficulty: 'medium-hard',
  estimatedMinutes: 18,
  coverConcepts: ['rocksdb', 'heap-backend', 'state-backend', 'incremental-checkpoints'],

  briefing: {
    story:
      'The user recommendation engine keeps per-user history in ValueState using the default heap state backend. The user base grew to 50 million and state hit 100 GB — far exceeding JVM heap limits. The task manager is OOMing every few minutes.',
    symptom:
      'heapPressure above 0.95. Task manager restarting repeatedly. Job status cycling between "running" and "restarting".',
    goal:
      'Switch to RocksDB state backend with incremental checkpoints. Bring heapPressure below 0.7 and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Replace HashMapStateBackend with EmbeddedRocksDBStateBackend. RocksDB stores state in native memory and on disk — the JVM heap is not used for the state data itself.',
        relatedConcept: 'rocksdb',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Also enable incremental checkpoints: new EmbeddedRocksDBStateBackend(true). For 100 GB of state, full checkpoints would be impossibly slow. Incremental checkpoints upload only SST files changed since last checkpoint.',
        relatedConcept: 'incremental-checkpoints',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-events',
        name: 'User Event Source',
        parallelism: 8,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'keyby-user',
        name: 'KeyBy userId',
        parallelism: 8,
        type: 'keyBy',
        stateBackend: 'heap',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'aggregate-history',
        name: 'User History Aggregation',
        parallelism: 8,
        type: 'aggregate',
        stateBackend: 'heap',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'sink-recommendations',
        name: 'Recommendation Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 30000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 8192 },
      { id: 'tm-2', slots: 8, maxHeapMb: 8192 },
    ],
    checkpointIntervalMs: 30000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'state-backend-oom',
      target: 'aggregate-history',
      params: { stateSizeMb: 102400, reason: 'heap-backend-100gb-state' },
    },
  ],

  victoryConditions: [
    {
      id: 'heap-ok',
      description: 'Heap pressure below 0.7',
      required: true,
      check: s => s.metrics.heapPressure < 0.7,
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
      concept: 'rocksdb',
      title: 'EmbeddedRocksDBStateBackend',
      body: 'RocksDB is a local key-value store embedded in each task manager. State is held in native memory and local disk rather than JVM heap. This allows managing state sizes far larger than available heap. The trade-off is higher read/write latency for state access.',
      showWhenFixed: true,
    },
    {
      concept: 'heap-backend',
      title: 'HashMapStateBackend',
      body: 'The default heap backend stores all state as Java objects in the JVM heap. It is fast (no serialization on access) but limited to available heap space. For state sizes beyond a few GB, switch to RocksDB.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'switch-state-backend',
    'enable-incremental-checkpoints',
    'configure-rocksdb-options',
    'add-task-manager-memory',
  ],
}

export default scenario
