import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-stateful-map',
  index: 4,
  title: 'Unbounded ValueState',
  subtitle: 'Easy · State TTL',
  difficulty: 'easy',
  estimatedMinutes: 10,
  coverConcepts: ['value-state', 'state-ttl', 'heap-oom', 'state-backend'],

  briefing: {
    story:
      'A user-session enrichment job stores per-user counters in ValueState. It has been running for 1 hour and the task manager is about to crash with an OutOfMemoryError — millions of user keys accumulated in heap memory and nobody set an expiry.',
    symptom:
      'heapPressure above 0.85 and climbing. Task manager GC overhead increasing. Job restart imminent.',
    goal:
      'Add StateTtlConfig with a 1-hour TTL on the ValueState so stale entries are cleaned up. Bring heapPressure below 0.7 and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'Open the map operator config and set StateTtlConfig with ttl=1h and UpdateType=OnCreateAndWrite. This tells Flink to evict entries that have not been updated in 1 hour.',
        relatedConcept: 'state-ttl',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Also enable background state cleanup (CleanupStrategies.inRocksdbCompactFilter or incrementalCleanup) so expired keys are removed without blocking the operator thread.',
        relatedConcept: 'state-ttl',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-events',
        name: 'User Event Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-session',
        name: 'Session Enrichment',
        parallelism: 4,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-output',
        name: 'Output Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 6, maxHeapMb: 2048 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 4,
      type: 'state-backend-oom',
      target: 'map-session',
      params: { stateSizeMb: 1800, reason: 'no-state-ttl' },
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
      concept: 'value-state',
      title: 'ValueState',
      body: 'ValueState stores a single value per key. Without expiry, a key that appeared once is kept forever. For unbounded key spaces (user IDs, session tokens) this causes unbounded memory growth.',
      showWhenFixed: false,
    },
    {
      concept: 'state-ttl',
      title: 'StateTtlConfig',
      body: 'StateTtlConfig.newBuilder(Duration).setUpdateType(OnCreateAndWrite).build() attaches an expiry to any managed state descriptor. Flink tracks last-access timestamps alongside values and either lazily evicts them or uses background strategies for proactive cleanup.',
      showWhenFixed: true,
    },
  ],

  availableActions: [
    'set-state-ttl',
    'enable-background-cleanup',
    'switch-state-backend',
    'scale-operator',
  ],
}

export default scenario
