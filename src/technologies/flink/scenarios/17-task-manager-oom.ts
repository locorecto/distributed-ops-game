import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-task-manager-oom',
  index: 17,
  title: 'Task Manager OOM — Managed Memory Misconfiguration',
  subtitle: 'Hard · Memory Tuning',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['managed-memory', 'jvm-heap', 'memory-fraction', 'rocksdb-memory'],

  briefing: {
    story:
      'After migrating to Flink on Kubernetes, the task managers are OOMKilled every few hours. The memory configuration was copied from an old setup where managed memory fraction was 0.4 — ideal for batch jobs but deadly for this streaming job that also needs JVM heap for operator logic, network buffers, and the JVM itself.',
    symptom:
      'heapPressure above 0.92. Kubernetes OOMKill events. jobStatus cycling between "running" and "restarting". restartCount increasing.',
    goal:
      'Reduce taskmanager.memory.managed.fraction from 0.4 to 0.1. Bring heapPressure below 0.75 and jobStatus to "running".',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'managed.fraction=0.4 reserves 40% of total TM memory for managed (RocksDB/batch) use. For streaming jobs using heap state, this starves the JVM heap. Set taskmanager.memory.managed.fraction=0.1.',
        relatedConcept: 'managed-memory',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Also review taskmanager.memory.network.fraction — network buffers eat into the total memory budget. A typical streaming job needs: framework ~10%, heap ~50–60%, network ~10%, managed ~10–15%.',
        relatedConcept: 'jvm-heap',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-events',
        name: 'Event Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'map-process',
        name: 'Processing Map',
        parallelism: 4,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'aggregate-state',
        name: 'Stateful Aggregate',
        parallelism: 4,
        type: 'aggregate',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'sink-output',
        name: 'Output Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 4, maxHeapMb: 2048 },
      { id: 'tm-2', slots: 4, maxHeapMb: 2048 },
    ],
    checkpointIntervalMs: 15000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 4,
      type: 'state-backend-oom',
      target: 'aggregate-state',
      params: { stateSizeMb: 1900, reason: 'managed-fraction-too-high' },
    },
    {
      atTick: 6,
      type: 'task-manager-down',
      target: 'tm-1',
      params: { reason: 'OOMKill-managed-fraction-0.4' },
    },
  ],

  victoryConditions: [
    {
      id: 'heap-ok',
      description: 'Heap pressure below 0.75',
      required: true,
      check: s => s.metrics.heapPressure < 0.75,
    },
    {
      id: 'job-running',
      description: 'Job status is running',
      required: true,
      check: s => s.metrics.jobStatus === 'running',
    },
  ],

  conceptCards: [
    {
      concept: 'managed-memory',
      title: 'Managed Memory in Flink',
      body: 'Flink\'s total process memory is divided into: JVM heap, JVM metaspace, framework heap, task heap, managed memory, network buffers, and JVM overhead. managed.fraction determines how much of total memory is pre-allocated for managed operations (RocksDB, batch sorting). Streaming jobs with heap state rarely need more than 10–15%.',
      showWhenFixed: true,
    },
    {
      concept: 'memory-fraction',
      title: 'Memory Configuration',
      body: 'Configure Flink memory via: taskmanager.memory.process.size (total), taskmanager.memory.managed.fraction, taskmanager.memory.network.fraction. Use Flink\'s memory calculator to verify the heap budget before deploying.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-managed-memory-fraction',
    'set-network-memory-fraction',
    'configure-tm-heap-size',
    'restart-task-managers',
  ],
}

export default scenario
