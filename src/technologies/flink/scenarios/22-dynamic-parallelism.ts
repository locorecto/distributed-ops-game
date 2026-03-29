import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-dynamic-parallelism',
  index: 22,
  title: 'Global Parallelism Bottleneck on Source',
  subtitle: 'Hard · Fine-Grained Parallelism',
  difficulty: 'hard',
  estimatedMinutes: 22,
  coverConcepts: ['parallelism', 'source-parallelism', 'operator-chaining', 'throughput'],

  briefing: {
    story:
      'The pipeline was deployed with env.setParallelism(1) from a developer laptop config. The source operator can handle 100 K records/s but is bottlenecked at 10 K. The downstream operators are mostly idle while the source is the single-threaded wall.',
    symptom:
      'recordsPerSecond around 10 000. backpressureRatio near zero (source is the bottleneck, not downstream). Source operator at 100% utilisation.',
    goal:
      'Set source parallelism to 10 independently of the global setting. Bring recordsPerSecond above 50 000 and backpressureRatio below 0.1.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'Call source.setParallelism(10) on the source operator specifically. This overrides the global setting for that operator without affecting the rest of the pipeline.',
        relatedConcept: 'parallelism',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'For a Kafka source, parallelism should not exceed the number of topic partitions — excess instances will be idle. Check partition count and set source parallelism to match.',
        relatedConcept: 'source-parallelism',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-kafka',
        name: 'Kafka Source (p=1)',
        parallelism: 1,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'filter-valid',
        name: 'Validation Filter',
        parallelism: 1,
        type: 'filter',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-transform',
        name: 'Transform Map',
        parallelism: 1,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-output',
        name: 'Output Sink',
        parallelism: 1,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 12, maxHeapMb: 4096 },
      { id: 'tm-2', slots: 12, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 2,
      type: 'source-lag',
      target: 'source-kafka',
      params: { rate: 10000, reason: 'parallelism-1-bottleneck' },
    },
  ],

  victoryConditions: [
    {
      id: 'throughput-high',
      description: 'Records per second above 50 000',
      required: true,
      check: s => s.metrics.recordsPerSecond > 50000,
    },
    {
      id: 'backpressure-low',
      description: 'Backpressure ratio below 0.1',
      required: true,
      check: s => s.metrics.backpressureRatio < 0.1,
    },
  ],

  conceptCards: [
    {
      concept: 'parallelism',
      title: 'Operator-Level Parallelism',
      body: 'Flink allows setting parallelism at three levels: global (env.setParallelism), per-operator (operator.setParallelism), and from the cluster default. Lower-precedence settings are overridden by higher ones. Per-operator settings allow fine-grained tuning.',
      showWhenFixed: true,
    },
    {
      concept: 'source-parallelism',
      title: 'Source Parallelism Best Practices',
      body: 'For Kafka sources, maximum useful parallelism = number of topic partitions. For file sources, it equals the number of files. Setting parallelism above this creates idle instances. Benchmark the source operator specifically to identify if it is the throughput bottleneck.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'scale-operator',
    'set-global-parallelism',
    'configure-source-parallelism',
    'add-task-manager',
  ],
}

export default scenario
