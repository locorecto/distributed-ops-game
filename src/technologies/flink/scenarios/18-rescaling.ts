import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-rescaling',
  index: 18,
  title: 'Rescaling — State Migration During Scale-Out',
  subtitle: 'Hard · Rescaling',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['rescaling', 'key-groups', 'savepoint', 'state-migration'],

  briefing: {
    story:
      'Black Friday is tomorrow. The team needs to scale the order processing job from 2 to 8 parallelism. Someone tried to change the parallelism in-place — the job crashed and has been restarting for 20 minutes. RocksDB state cannot be redistributed on a live job.',
    symptom:
      'jobStatus = "restarting". restartCount > 3. State migration failed mid-stream. Job is in a broken intermediate state.',
    goal:
      'Take a savepoint before rescaling, restore on the new parallelism of 8. Bring jobStatus to "running" and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Cancel the job and restore from the last valid savepoint with --parallelism 8. Flink redistributes key groups (128 by default) across the new number of operator instances.',
        relatedConcept: 'savepoint',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Key group redistribution: Flink assigns key_hash % maxParallelism to a key group, then distributes key groups across operator instances. Scaling from 2 to 8 moves 75% of key groups — this takes time but is done safely during restore.',
        relatedConcept: 'key-groups',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-orders',
        name: 'Order Source',
        parallelism: 2,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 20000,
      },
      {
        id: 'keyby-order',
        name: 'KeyBy orderId',
        parallelism: 2,
        type: 'keyBy',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 20000,
      },
      {
        id: 'aggregate-order',
        name: 'Order Aggregation',
        parallelism: 2,
        type: 'aggregate',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 20000,
      },
      {
        id: 'sink-fulfillment',
        name: 'Fulfillment Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 20000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 4, maxHeapMb: 4096 },
      { id: 'tm-2', slots: 4, maxHeapMb: 4096 },
      { id: 'tm-3', slots: 4, maxHeapMb: 4096 },
      { id: 'tm-4', slots: 4, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 20000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'task-manager-down',
      target: 'tm-1',
      params: { reason: 'in-place-rescale-failure' },
    },
    {
      atTick: 4,
      type: 'task-manager-down',
      target: 'tm-2',
      params: { reason: 'in-place-rescale-failure' },
    },
  ],

  victoryConditions: [
    {
      id: 'job-running',
      description: 'Job status is running',
      required: true,
      check: s => s.metrics.jobStatus === 'running',
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
      concept: 'rescaling',
      title: 'Rescaling a Flink Job',
      body: 'To rescale a job, take a savepoint, cancel the job, then restart with the new parallelism from the savepoint. Flink maps the old key groups to new operator instances during restore. Never attempt in-place parallelism changes on a running stateful job.',
      showWhenFixed: true,
    },
    {
      concept: 'key-groups',
      title: 'Key Groups',
      body: 'Key groups are the unit of key redistribution. The total number (max parallelism, default 128) is fixed at job creation. Each operator instance owns a contiguous range of key groups. During a rescale restore, Flink reassigns ranges to match the new parallelism.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'trigger-savepoint',
    'scale-operator',
    'restore-from-savepoint',
    'cancel-and-restart',
  ],
}

export default scenario
