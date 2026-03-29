import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-exactly-once-sink',
  index: 19,
  title: 'Duplicate Rows After Task Failure',
  subtitle: 'Hard · Exactly-Once Semantics',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['exactly-once', 'two-phase-commit', 'at-least-once', 'idempotent-sink'],

  briefing: {
    story:
      'The billing pipeline writes invoices to PostgreSQL. After a task failure last night, 500 invoice rows were duplicated — the JDBC sink uses at-least-once and replays records from the last checkpoint on recovery. Finance had to manually deduplicate thousands of rows.',
    symptom:
      'errorRate elevated post-recovery. Duplicate rows in downstream DB. Checkpoint recovery replays records already written.',
    goal:
      'Implement TwoPhaseCommitSinkFunction with JDBC upsert (INSERT ... ON CONFLICT DO UPDATE). Bring errorRate below 0.01 and systemHealthScore above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Switch the JDBC sink to use JdbcSink.exactlyOnceSink() which implements two-phase commit. During pre-commit, data is written to a staging transaction. On checkpoint completion, the transaction commits.',
        relatedConcept: 'two-phase-commit',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'As a simpler alternative, make the sink idempotent: use INSERT INTO invoices ... ON CONFLICT (id) DO UPDATE SET ... so replays overwrite with the same data rather than inserting duplicates.',
        relatedConcept: 'idempotent-sink',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-billing',
        name: 'Billing Event Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-invoice',
        name: 'Invoice Generation',
        parallelism: 4,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-postgres',
        name: 'JDBC Sink (at-least-once)',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 6, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 5,
      type: 'task-manager-down',
      target: 'tm-1',
      params: { reason: 'simulated-failure-to-trigger-recovery' },
    },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'health-good',
      description: 'System health above 85%',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'exactly-once',
      title: 'Exactly-Once End-to-End',
      body: 'Flink achieves exactly-once end-to-end by coordinating checkpoints with sink transactions. At checkpoint time, sinks pre-commit but do not finalize. When all operators confirm checkpoint completion, sinks receive the commit signal. If the job fails before commit, the transaction is rolled back.',
      showWhenFixed: true,
    },
    {
      concept: 'two-phase-commit',
      title: 'Two-Phase Commit Sink',
      body: 'TwoPhaseCommitSinkFunction implements the XA protocol over Flink checkpoints. beginTransaction(), preCommit(), commit() and abort() mirror database transaction lifecycle. The JDBC connector supports this natively via JdbcSink.exactlyOnceSink().',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'enable-exactly-once-sink',
    'configure-jdbc-upsert',
    'set-checkpoint-mode',
    'enable-two-phase-commit',
  ],
}

export default scenario
