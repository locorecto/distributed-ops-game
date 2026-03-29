import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-26-multi-sink',
  index: 26,
  title: 'Multi-Sink Exactly-Once Fanout',
  subtitle: 'Expert · Exactly-Once Coordination',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['multiple-sinks', 'exactly-once', 'two-phase-commit', 'sink-coordination', 'checkpoint-barrier'],

  briefing: {
    story:
      'A payment events stream fans out to three sinks: a Kafka audit topic, a PostgreSQL ledger, and an S3 archival bucket. The Kafka and S3 sinks are correctly configured for exactly-once semantics via two-phase commit. The PostgreSQL sink was added hastily during an incident and is using at-least-once mode — it does not participate in the distributed 2PC protocol coordinated by checkpoint barriers. After a TaskManager crash during peak load, the job recovered from the last checkpoint, but the PostgreSQL sink had already written $200K in duplicate payment records that were not rolled back.',
    symptom:
      'PostgreSQL ledger contains duplicate payment rows for the 90-second window between the last checkpoint and the crash. Kafka audit topic is clean (exactly-once). S3 is clean (exactly-once). Only the PostgreSQL sink is duplicating. Checkpoint barriers are completing in under 1 second — the barrier alignment is working, but JDBC sink semantics are wrong.',
    goal:
      'Enable 2PC on the PostgreSQL JDBC sink, align all three sinks to exactly-once checkpoint mode, and verify that a simulated crash followed by recovery produces zero duplicate records across all sinks.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'The JDBC sink needs to be configured with JdbcExactlyOnceOptions and must use a XA-capable JDBC driver. Use enable-2pc-sink to switch the PostgreSQL sink from at-least-once to exactly-once mode.',
        relatedConcept: 'two-phase-commit',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'All sinks in a Flink job share the same checkpoint barrier. For the 2PC guarantee to hold across all three sinks, every sink must flush and pre-commit on barrier receipt, then commit only after the checkpoint completes. Use align-checkpoint-mode to ensure all sinks are configured consistently.',
        relatedConcept: 'checkpoint-barrier',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: 'Use verify-sink-semantics to run a chaos test: inject a crash between pre-commit and commit. Confirm that on recovery, all three sinks either all commit or all abort the in-flight transaction.',
        relatedConcept: 'sink-coordination',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-payments',
        name: 'Payment Events Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 5000,
      },
      {
        id: 'map-validate',
        name: 'Payment Validator',
        parallelism: 4,
        type: 'map',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 5000,
      },
      {
        id: 'sink-kafka-audit',
        name: 'Kafka Audit Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 5000,
      },
      {
        id: 'sink-postgres-ledger',
        name: 'PostgreSQL Ledger Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 5000,
      },
      {
        id: 'sink-s3-archive',
        name: 'S3 Archive Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 5000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 8192 },
      { id: 'tm-2', slots: 8, maxHeapMb: 8192 },
    ],
    checkpointIntervalMs: 5000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 2,
      type: 'sink-mode-mismatch',
      target: 'sink-postgres-ledger',
      params: { actualMode: 'at-least-once', requiredMode: 'exactly-once', twoPhaseCommit: false },
    },
    {
      atTick: 8,
      type: 'task-manager-crash',
      target: 'tm-1',
      params: { duplicateRecordsWritten: 2400, duplicateValueUsd: 200000, affectedSink: 'sink-postgres-ledger' },
    },
  ],

  victoryConditions: [
    {
      id: 'all-sinks-exactly-once',
      description: 'All sinks operating in exactly-once mode',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'no-duplicates-after-recovery',
      description: 'Zero duplicate records after crash recovery',
      required: true,
      check: s => s.metrics.restartCount <= 1 && s.metrics.errorRate < 0.01,
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
      concept: 'two-phase-commit',
      title: 'Two-Phase Commit in Flink Sinks',
      body: "Flink's exactly-once guarantee for external sinks relies on two-phase commit (2PC) coordinated by checkpoints. On checkpoint barrier receipt, a sink pre-commits (writes to a pending/staging area). Once the checkpoint completes, Flink calls notifyCheckpointComplete() and the sink commits. On failure, uncommitted pre-writes are rolled back. The JDBC sink supports this via XA transactions.",
      showWhenFixed: true,
    },
    {
      concept: 'checkpoint-barrier',
      title: 'Checkpoint Barriers & Sink Coordination',
      body: 'Checkpoint barriers flow through the operator DAG like data records. Each sink operator must acknowledge the barrier by flushing buffered data and pre-committing before the checkpoint can complete. If any sink uses at-least-once mode, it does not participate in this coordination — its writes are committed immediately and cannot be rolled back on failure.',
      showWhenFixed: true,
    },
    {
      concept: 'exactly-once',
      title: 'Exactly-Once End-to-End',
      body: 'True end-to-end exactly-once requires: (1) a replayable source (e.g., Kafka with offset tracking), (2) deterministic operators, and (3) transactional or idempotent sinks participating in 2PC. If even one sink is at-least-once, the weakest guarantee wins for that sink. Mixed semantics across sinks are valid but must be intentional.',
      showWhenFixed: false,
    },
  ],

  availableActions: ['enable-2pc-sink', 'align-checkpoint-mode', 'verify-sink-semantics'],
}

export default scenario
