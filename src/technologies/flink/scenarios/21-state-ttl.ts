import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-state-ttl',
  index: 21,
  title: 'Expired State Not Cleaned Up',
  subtitle: 'Hard · State TTL Background Cleanup',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['state-ttl', 'background-cleanup', 'rocksdb-compaction', 'stale-state'],

  briefing: {
    story:
      'The deduplication job was given StateTtlConfig with NeverReturnExpired — but nobody enabled background cleanup. Expired entries remain in RocksDB, consuming 50 GB of disk and JVM off-heap. The job is healthy but the underlying storage is a ticking time bomb.',
    symptom:
      'heapPressure above 0.75. RocksDB disk usage at 50 GB and growing. stateSize metric increasing even though TTL has logically expired entries.',
    goal:
      'Enable background cleanup via inRocksdbCompactFilter or incrementalCleanup. Bring heapPressure below 0.6 and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'Add .cleanupInRocksdbCompactFilter(1000) to StateTtlConfig. This installs a RocksDB compaction filter that physically removes expired keys during compaction. The argument is the query count between checks.',
        relatedConcept: 'rocksdb-compaction',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'For heap state backend, use .cleanupIncrementally(10, false) instead. This checks 10 state entries per state access for expiry and removes them lazily. Combined with NeverReturnExpired, this keeps the active working set clean.',
        relatedConcept: 'background-cleanup',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-events',
        name: 'Event Source',
        parallelism: 8,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 20000,
      },
      {
        id: 'filter-dedup',
        name: 'Deduplication Filter',
        parallelism: 8,
        type: 'filter',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 20000,
      },
      {
        id: 'aggregate-counts',
        name: 'Count Aggregation',
        parallelism: 8,
        type: 'aggregate',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 20000,
      },
      {
        id: 'sink-output',
        name: 'Output Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 20000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 6144 },
      { id: 'tm-2', slots: 8, maxHeapMb: 6144 },
    ],
    checkpointIntervalMs: 20000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'state-backend-oom',
      target: 'filter-dedup',
      params: { stateSizeMb: 51200, reason: 'no-background-cleanup-stale-state' },
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
      concept: 'state-ttl',
      title: 'TTL Without Background Cleanup',
      body: 'StateTtlConfig can set entries to logically expire (NeverReturnExpired) but without a cleanup strategy, the data remains physically in the state store. Only reads that touch the entry cause lazy cleanup. The storage keeps growing.',
      showWhenFixed: false,
    },
    {
      concept: 'background-cleanup',
      title: 'Background State Cleanup Strategies',
      body: 'cleanupInRocksdbCompactFilter: Installs a native compaction filter in RocksDB. During compaction (which RocksDB performs automatically), expired keys are physically removed.\n\ncleanupIncrementally: On each state access, checks N additional entries for expiry. Spreads cleanup cost across regular operations.',
      showWhenFixed: true,
    },
  ],

  availableActions: [
    'enable-rocksdb-compact-filter',
    'enable-incremental-cleanup',
    'set-state-ttl',
    'trigger-manual-compaction',
  ],
}

export default scenario
