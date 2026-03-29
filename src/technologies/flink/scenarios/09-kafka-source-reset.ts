import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-kafka-source-reset',
  index: 9,
  title: 'Kafka Source Starts from Latest',
  subtitle: 'Medium · Source Configuration',
  difficulty: 'medium',
  estimatedMinutes: 12,
  coverConcepts: ['kafka-source', 'startup-mode', 'offset-reset', 'backlog-processing'],

  briefing: {
    story:
      'A new Flink pipeline was deployed to process user activity events. The job starts fine but the data team noticed it is missing 2 hours of events that were produced while the job was being deployed. The Kafka source defaulted to "latest" startup mode and skipped the entire backlog.',
    symptom:
      'Effective throughput lower than expected. watermarkLag elevated. Historical records not appearing in downstream reports.',
    goal:
      'Reconfigure the Kafka source to start from earliest-offset or a specific timestamp. Bring systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Set scan.startup.mode = "earliest-offset" in the Kafka source properties. This tells Flink to start consuming from the beginning of each partition.',
        relatedConcept: 'startup-mode',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'If you only need the last 2 hours, use scan.startup.mode = "timestamp" and set scan.startup.timestamp-millis to (now - 2h). This avoids replaying data that is older than needed.',
        relatedConcept: 'offset-reset',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-kafka',
        name: 'Kafka Source (latest)',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-parse',
        name: 'Event Parser',
        parallelism: 4,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'aggregate-counts',
        name: 'Activity Aggregation',
        parallelism: 4,
        type: 'aggregate',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-warehouse',
        name: 'Warehouse Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 2,
      type: 'source-lag',
      target: 'source-kafka',
      params: { rate: 200, reason: 'latest-startup-missing-backlog' },
    },
  ],

  victoryConditions: [
    {
      id: 'health-good',
      description: 'System health above 80%',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'kafka-source',
      title: 'Flink Kafka Source',
      body: 'The Flink Kafka source (KafkaSource) supports multiple startup modes: earliest-offset, latest-offset, committed-offsets, timestamp, and specific-offsets. The default for new consumer groups is latest, which skips any backlog.',
      showWhenFixed: false,
    },
    {
      concept: 'startup-mode',
      title: 'Kafka Startup Modes',
      body: 'earliest-offset consumes the full topic history. committed-offsets picks up where the consumer group left off. timestamp mode lets you specify an exact point in time. Choose based on whether completeness or freshness is the priority.',
      showWhenFixed: true,
    },
  ],

  availableActions: [
    'set-kafka-startup-mode',
    'set-startup-timestamp',
    'configure-kafka-source',
    'reset-consumer-offsets',
  ],
}

export default scenario
