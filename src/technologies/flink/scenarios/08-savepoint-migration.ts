import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-savepoint-migration',
  index: 8,
  title: 'Savepoint Restore Failure — Operator UID Change',
  subtitle: 'Medium · Savepoints',
  difficulty: 'medium',
  estimatedMinutes: 15,
  coverConcepts: ['savepoints', 'operator-uid', 'state-migration', 'job-graph'],

  briefing: {
    story:
      'The pipeline was enhanced with a new deduplication operator inserted between the map and the sink. After deploying, the team tried to restore from the last savepoint — and the job failed to start. Flink could not match the savepoint state to the new topology because operator UIDs were auto-generated and changed when the graph was modified.',
    symptom:
      'jobStatus = "failing". Job refuses to start: "Savepoint state cannot be mapped to any operator in the new topology." System health at 0.',
    goal:
      'Assign explicit UIDs to all operators, take a new savepoint, and restore successfully. Bring jobStatus to "running" and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'Every operator in the job graph must have an explicit UID set via operator.uid("my-stable-id"). Without explicit UIDs, Flink auto-generates them from the job graph structure — and they change whenever the topology changes.',
        relatedConcept: 'operator-uid',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'After assigning UIDs, take a savepoint from the current (broken) job if it still has state. Restore with --allowNonRestoredState if the old savepoint contains state for operators that no longer exist.',
        relatedConcept: 'savepoints',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-stream',
        name: 'Event Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'map-transform',
        name: 'Transform Map',
        parallelism: 4,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'filter-dedup',
        name: 'Deduplication (NEW)',
        parallelism: 4,
        type: 'filter',
        stateBackend: 'heap',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'sink-output',
        name: 'Output Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 30000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 6, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 30000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 1,
      type: 'slow-operator',
      target: 'filter-dedup',
      params: { latencyMs: 0, reason: 'savepoint-uid-mismatch' },
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
      concept: 'savepoints',
      title: 'Savepoints',
      body: 'A savepoint is a manually triggered, full snapshot of job state. Unlike checkpoints which are automatic, savepoints are meant for planned operations: upgrades, rescaling, A/B migrations. They are kept until explicitly deleted.',
      showWhenFixed: false,
    },
    {
      concept: 'operator-uid',
      title: 'Operator UIDs',
      body: 'Flink maps savepoint state to operators using UIDs. Without explicit UIDs, Flink hashes the job graph structure to generate them — change the graph and the UIDs change. Assign stable UIDs via .uid("descriptive-name") on every stateful operator.',
      showWhenFixed: true,
    },
  ],

  availableActions: [
    'assign-operator-uid',
    'trigger-savepoint',
    'restore-from-savepoint',
    'allow-non-restored-state',
  ],
}

export default scenario
