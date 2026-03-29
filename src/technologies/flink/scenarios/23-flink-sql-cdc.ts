import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-23-flink-sql-cdc',
  index: 23,
  title: 'Flink SQL CDC Pipeline',
  subtitle: 'Expert · CDC & Changelog',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['CDC-connector', 'upsert-kafka', 'changelog-mode', 'flink-sql', 'debezium'],

  briefing: {
    story:
      'A Flink SQL job reads a MySQL CDC source via Debezium and writes to an upsert-Kafka sink for real-time inventory tracking. After a recent schema change that added a nullable column to the MySQL source table, the CDC connector started throwing deserialization errors and the job keeps restarting. To make things worse, the upsert-Kafka sink was never given a PRIMARY KEY declaration, so Flink falls back to full table scans on every checkpoint instead of using key-based upserts.',
    symptom:
      'Job restarts every 2-3 minutes with DeserializationException from the CDC source. Checkpoint durations have ballooned from 800ms to 45 seconds. The upsert-Kafka sink topic shows unbounded growth because deletes are never applied — missing primary key means no compaction key is set.',
    goal:
      'Fix the CDC schema to handle the new nullable column, declare the primary key on the upsert-Kafka sink, and restore the job from a savepoint so inventory data is accurate and checkpoints complete in under 2 seconds.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'The Debezium CDC connector is failing because the schema registry does not know about the new nullable column. Use fix-cdc-schema to update the Avro schema and register the new version with backward compatibility.',
        relatedConcept: 'CDC-connector',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'The upsert-Kafka sink requires a PRIMARY KEY constraint in the CREATE TABLE DDL. Without it Flink cannot determine the upsert key and resorts to append-only mode. Use declare-primary-key to add the constraint.',
        relatedConcept: 'upsert-kafka',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: 'After fixing schema and primary key, restart the job from the last valid savepoint rather than from scratch to avoid re-reading the full CDC backlog.',
        relatedConcept: 'flink-sql',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-mysql-cdc',
        name: 'MySQL CDC Source',
        parallelism: 2,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'map-normalize',
        name: 'Schema Normalize',
        parallelism: 2,
        type: 'map',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'sink-upsert-kafka',
        name: 'Upsert Kafka Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 15000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 4, maxHeapMb: 8192 },
      { id: 'tm-2', slots: 4, maxHeapMb: 8192 },
    ],
    checkpointIntervalMs: 15000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'deserialization-error',
      target: 'source-mysql-cdc',
      params: { errorMessage: 'Unknown field in CDC event: stock_reserved (nullable INT)', restartLoopIntervalTicks: 4 },
    },
    {
      atTick: 4,
      type: 'checkpoint-duration-spike',
      target: 'sink-upsert-kafka',
      params: { durationMs: 45000, reason: 'missing-primary-key-full-scan' },
    },
  ],

  victoryConditions: [
    {
      id: 'no-deserialization-errors',
      description: 'CDC source has no deserialization errors',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'checkpoint-duration-ok',
      description: 'Checkpoint duration below 2 seconds',
      required: true,
      check: s => s.metrics.checkpointDurationMs < 2000,
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
      concept: 'CDC-connector',
      title: 'Flink CDC Connector & Schema Evolution',
      body: 'Flink CDC connectors (e.g., flink-cdc-connectors for MySQL/Postgres) use Debezium under the hood. When the upstream schema changes, the Avro or JSON schema must be updated and registered before the connector can deserialize new events. Backward-compatible changes (adding nullable columns) are safe; forward-incompatible changes require a savepoint-based migration.',
      showWhenFixed: true,
    },
    {
      concept: 'upsert-kafka',
      title: 'Upsert-Kafka Sink & Primary Keys',
      body: "The upsert-kafka connector writes Kafka messages in upsert semantics: a non-null value is an INSERT/UPDATE and a null value (tombstone) is a DELETE. Flink requires a PRIMARY KEY declared in the DDL to know which field(s) form the Kafka message key. Without it the connector falls back to append mode — deletes are never emitted and the topic grows without bound.",
      showWhenFixed: true,
    },
    {
      concept: 'changelog-mode',
      title: 'Changelog Modes in Flink SQL',
      body: 'Flink SQL tables operate in one of several changelog modes: append-only, upsert, or full changelog (+I/-U/+U/-D). The connector chosen for a sink must match the changelog mode produced by the query. A CDC source produces a full changelog; piping it to an upsert sink requires a primary key so Flink can collapse +U/-U pairs into single upsert messages.',
      showWhenFixed: false,
    },
  ],

  availableActions: ['fix-cdc-schema', 'declare-primary-key', 'restart-with-savepoint'],
}

export default scenario
