import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-27-changelog',
  index: 27,
  title: 'Changelog Retract Storm',
  subtitle: 'Expert · Changelog & Upsert Mode',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['CHANGELOG_MODE', 'retract-stream', 'upsert-stream', 'dynamic-table', 'changelog-normalization'],

  briefing: {
    story:
      'A Flink SQL aggregation job computes running totals (GROUP BY user_id, SUM(amount)) and writes results to a Kafka sink. The query produces a retract changelog: every time a user\'s sum changes, Flink emits a retract (-D) for the old value followed by an insert (+I) for the new value — 2 messages for every update, plus the original insert, meaning 3 Kafka messages per aggregate change. With 1 million active users updating every few seconds, Kafka write throughput tripled overnight. The producer is backpressured, checkpoint durations are climbing, and the sink topic is 3x the expected size. Switching to an upsert-kafka sink would reduce this to 1 message per update, but the required PRIMARY KEY declaration is absent from the DDL.',
    symptom:
      'Kafka sink topic message rate is 3x the user update rate. Flink producer backpressure ratio above 0.7. Checkpoint durations at 18 seconds (target: under 3 seconds). Sink topic log contains interleaved +I/-D+I message triples. No primary key on the aggregation result table.',
    goal:
      'Switch the Kafka sink from retract mode to upsert-kafka connector, declare the primary key (user_id) on the result table, and configure the changelog mode to produce single upsert messages per update — reducing Kafka throughput by 3x and restoring normal checkpoint durations.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'The root cause is retract mode: without a primary key, Flink cannot produce upsert messages and must emit retract pairs. Declare PRIMARY KEY (user_id) NOT ENFORCED on the sink table DDL to unlock upsert mode.',
        relatedConcept: 'retract-stream',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'After declaring the primary key, switch the connector from kafka to upsert-kafka in the DDL. The upsert-kafka connector maps Flink upsert messages directly to Kafka compacted log semantics: one message per key per update.',
        relatedConcept: 'upsert-stream',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: 'Use configure-changelog-mode to set the sink changelog mode explicitly. Verify that the downstream consumer can handle upsert semantics (last-value-wins per key) rather than expecting a full changelog.',
        relatedConcept: 'CHANGELOG_MODE',
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
        checkpointIntervalMs: 10000,
      },
      {
        id: 'agg-sum-by-user',
        name: 'Sum by User (GROUP BY)',
        parallelism: 8,
        type: 'aggregate',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-kafka-retract',
        name: 'Kafka Retract Sink',
        parallelism: 8,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 16, maxHeapMb: 16384 },
      { id: 'tm-2', slots: 16, maxHeapMb: 16384 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 1,
      type: 'changelog-amplification',
      target: 'sink-kafka-retract',
      params: { messagesPerUpdate: 3, mode: 'retract', backpressureRatio: 0.75, checkpointDurationMs: 18000 },
    },
    {
      atTick: 3,
      type: 'backpressure-spike',
      target: 'sink-kafka-retract',
      params: { ratio: 0.82 },
    },
  ],

  victoryConditions: [
    {
      id: 'throughput-reduced',
      description: 'Kafka write throughput reduced to 1x (upsert mode)',
      required: true,
      check: s => s.metrics.backpressureRatio < 0.1,
    },
    {
      id: 'checkpoint-duration-ok',
      description: 'Checkpoint duration below 3 seconds',
      required: true,
      check: s => s.metrics.checkpointDurationMs < 3000,
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
      concept: 'retract-stream',
      title: 'Retract Streams in Flink SQL',
      body: 'When a Flink SQL aggregation updates a previously emitted result, it must retract the old value before inserting the new one. This produces two messages per update: a retract (-D) for the old row and an insert (+I) for the new row. Retract mode is correct but verbose — for sinks that support upsert semantics, it wastes 2-3x bandwidth.',
      showWhenFixed: true,
    },
    {
      concept: 'upsert-stream',
      title: 'Upsert Mode & upsert-kafka',
      body: 'Upsert mode collapses the retract/insert pair into a single upsert message keyed by the primary key. The upsert-kafka connector maps this directly to Kafka\'s compacted log: a message with a non-null value is an upsert, a null-value message is a delete (tombstone). This requires a PRIMARY KEY on the result table so Flink knows the upsert key.',
      showWhenFixed: true,
    },
    {
      concept: 'dynamic-table',
      title: 'Dynamic Tables & Changelog Modes',
      body: 'Flink SQL models streaming data as dynamic tables that change over time. Each change is represented in a changelog. The full changelog supports +I (insert), -U (retract update before), +U (update after), and -D (delete). Upsert mode simplifies this to just upsert (+I/+U merged) and delete (-D as tombstone), trading expressiveness for efficiency.',
      showWhenFixed: false,
    },
  ],

  availableActions: ['switch-to-upsert-sink', 'declare-pk-for-aggregation', 'configure-changelog-mode'],
}

export default scenario
