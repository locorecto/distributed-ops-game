import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-checkpoint-failure',
  index: 7,
  title: 'Checkpoint Timeout — RocksDB 200 GB State',
  subtitle: 'Medium · Checkpointing',
  difficulty: 'medium',
  estimatedMinutes: 15,
  coverConcepts: ['checkpointing', 'rocksdb', 'incremental-checkpoints', 'checkpoint-timeout'],

  briefing: {
    story:
      'The fraud detection job has been running for weeks and its RocksDB state has grown to 200 GB. The checkpoint timeout is still at the default 60 seconds — not nearly enough to snapshot 200 GB. Checkpoints are failing every cycle, the job has no recovery point, and an on-call escalation just fired.',
    symptom:
      'checkpointFailureRate = 1.0. No completed checkpoints in the last 30 minutes. systemHealthScore below 40.',
    goal:
      'Achieve checkpointFailureRate below 0.1 and systemHealthScore above 80 by increasing checkpoint timeout and enabling incremental checkpoints.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Increase checkpoint timeout to 5 minutes (300 000 ms) in the checkpoint configuration. The default 60s cannot accommodate large RocksDB state.',
        relatedConcept: 'checkpoint-timeout',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Enable incremental checkpoints: EmbeddedRocksDBStateBackend with setIncrementalCheckpointingEnabled(true). Incremental checkpoints only ship the SST files that changed since the last checkpoint — typically 1–5% of total state.',
        relatedConcept: 'incremental-checkpoints',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-transactions',
        name: 'Transaction Source',
        parallelism: 8,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 60000,
      },
      {
        id: 'map-features',
        name: 'Feature Extraction',
        parallelism: 8,
        type: 'map',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 60000,
      },
      {
        id: 'aggregate-fraud',
        name: 'Fraud Aggregation',
        parallelism: 8,
        type: 'aggregate',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 60000,
      },
      {
        id: 'sink-alerts',
        name: 'Alert Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 60000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 8192 },
      { id: 'tm-2', slots: 8, maxHeapMb: 8192 },
      { id: 'tm-3', slots: 8, maxHeapMb: 8192 },
    ],
    checkpointIntervalMs: 60000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 2,
      type: 'state-backend-oom',
      target: 'aggregate-fraud',
      params: { stateSizeMb: 204800, reason: 'large-rocksdb-state' },
    },
    {
      atTick: 3,
      type: 'checkpoint-timeout',
      target: '__global__',
      params: { timeoutMs: 60000, stateMb: 204800 },
    },
  ],

  victoryConditions: [
    {
      id: 'checkpoint-ok',
      description: 'Checkpoint failure rate below 10%',
      required: true,
      check: s => s.metrics.checkpointFailureRate < 0.1,
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
      concept: 'checkpointing',
      title: 'Flink Checkpointing',
      body: 'Checkpoints are Flink\'s fault-tolerance mechanism. Flink periodically takes a consistent snapshot of all operator state and writes it to a durable store (HDFS, S3). On failure, Flink restores the last completed checkpoint and replays input from that point.',
      showWhenFixed: false,
    },
    {
      concept: 'incremental-checkpoints',
      title: 'Incremental Checkpoints',
      body: 'With EmbeddedRocksDBStateBackend and incremental checkpointing enabled, Flink only uploads SST files that have changed since the previous checkpoint. For large states this reduces checkpoint overhead from gigabytes to megabytes.',
      showWhenFixed: true,
    },
  ],

  availableActions: [
    'set-checkpoint-timeout',
    'enable-incremental-checkpoints',
    'set-checkpoint-interval',
    'configure-state-backend',
  ],
}

export default scenario
