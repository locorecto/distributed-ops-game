import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-backpressure',
  index: 1,
  title: 'Sink Backpressure',
  subtitle: 'Beginner · Backpressure Propagation',
  difficulty: 'beginner',
  estimatedMinutes: 5,
  coverConcepts: ['backpressure', 'parallelism', 'async-io', 'sink-throughput'],

  briefing: {
    story:
      'The order analytics pipeline was humming along until the reporting DB started responding slowly. Now records are piling up all the way to the Kafka source and throughput has collapsed.',
    symptom:
      'Backpressure ratio above 0.8. Source operator shows "backpressured" status. End-to-end latency climbing past 30 seconds.',
    goal:
      'Reduce backpressureRatio below 0.1 and bring systemHealthScore above 80 by scaling the sink or enabling async I/O.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'The sink is the bottleneck — it writes synchronously to a slow database. Try increasing the sink parallelism to spread writes across more task slots.',
        relatedConcept: 'parallelism',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'If scaling does not help enough, switch the sink to use AsyncFunction with a capacity of 100 inflight requests. This lets the operator overlap I/O waits.',
        relatedConcept: 'async-io',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-kafka',
        name: 'Kafka Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-enrich',
        name: 'Enrichment Map',
        parallelism: 4,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-db',
        name: 'DB Sink',
        parallelism: 1,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 4096 },
      { id: 'tm-2', slots: 8, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 5,
      type: 'backpressure-spike',
      target: 'sink-db',
      params: { ratio: 0.92 },
    },
  ],

  victoryConditions: [
    {
      id: 'backpressure-low',
      description: 'Backpressure ratio below 0.1',
      required: true,
      check: s => s.metrics.backpressureRatio < 0.1,
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
      concept: 'backpressure',
      title: 'Backpressure in Flink',
      body: 'When a downstream operator cannot keep up with its upstream, Flink propagates resistance upstream through credit-based flow control. The source eventually slows down to match the slowest stage — no data is lost, but throughput drops.',
      showWhenFixed: true,
    },
    {
      concept: 'async-io',
      title: 'Async I/O Operator',
      body: 'Flink\'s AsyncFunction lets you issue many I/O requests concurrently while a single operator thread handles the callbacks. This eliminates synchronous blocking and can multiply effective throughput by orders of magnitude.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'scale-operator',
    'enable-async-io',
    'adjust-parallelism',
    'add-task-manager',
  ],
}

export default scenario
