import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-event-time',
  index: 3,
  title: 'Processing Time vs Event Time',
  subtitle: 'Easy · Time Semantics',
  difficulty: 'easy',
  estimatedMinutes: 10,
  coverConcepts: ['event-time', 'processing-time', 'watermarks', 'out-of-order-events'],

  briefing: {
    story:
      'The data team is reprocessing 6 months of historical click events to rebuild user engagement metrics. The job completes in 10 seconds (great!) but the hourly counts are completely wrong — events from 2 PM appear in the 3 PM bucket because Flink used wall-clock time instead of the timestamp embedded in each event.',
    symptom:
      'errorRate above 0.20. Aggregation results inconsistent with expected historical values. Watermark lag near zero (suspicious for historical data).',
    goal:
      'Switch to event-time semantics with a BoundedOutOfOrdernessWatermarks strategy. Bring errorRate below 0.05 and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'The source uses ProcessingTimeService. Change the time characteristic to EventTime and assign watermarks using WatermarkStrategy.forBoundedOutOfOrderness with a 10-second tolerance.',
        relatedConcept: 'event-time',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Ensure the watermark extractor reads the "event_ts" field from each record. Without a valid timestamp extractor the watermark stays at Long.MIN_VALUE and windows never fire.',
        relatedConcept: 'watermarks',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-clicks',
        name: 'Click Events Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'keyby-user',
        name: 'KeyBy userId',
        parallelism: 4,
        type: 'keyBy',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'window-hourly',
        name: 'Hourly Window',
        parallelism: 4,
        type: 'window',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-metrics',
        name: 'Metrics Sink',
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
      type: 'watermark-stall',
      target: 'source-clicks',
      params: { lagMs: 0, reason: 'processing-time-semantics' },
    },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 5%',
      required: true,
      check: s => s.metrics.errorRate < 0.05,
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
      concept: 'event-time',
      title: 'Event Time vs Processing Time',
      body: 'Processing time uses the wall clock of the machine running the job. Event time uses the timestamp embedded in the data itself. For historical reprocessing or out-of-order streams, only event time produces correct results.',
      showWhenFixed: true,
    },
    {
      concept: 'watermarks',
      title: 'Watermarks',
      body: 'A watermark is a marker in the stream that asserts "all events with timestamp ≤ T have been seen." Flink uses watermarks to decide when a window can be closed and its result emitted. Watermarks flow from source operators downstream.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-time-characteristic',
    'configure-watermark-strategy',
    'set-watermark-interval',
    'configure-timestamp-extractor',
  ],
}

export default scenario
