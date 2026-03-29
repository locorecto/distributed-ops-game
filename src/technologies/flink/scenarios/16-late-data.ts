import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-late-data',
  index: 16,
  title: 'Late Data Dropping 20% of Records',
  subtitle: 'Medium-Hard · Late Data Handling',
  difficulty: 'medium-hard',
  estimatedMinutes: 18,
  coverConcepts: ['allowed-lateness', 'side-output', 'late-records', 'data-quality'],

  briefing: {
    story:
      'The IoT pipeline processes telemetry from field devices. Some devices have unreliable connectivity and send batches of events 3–10 seconds late. With allowedLateness=0, 20% of device readings are dropped. The SLA requires 99.5% data completeness.',
    symptom:
      'errorRate around 0.20. Window completeness below SLA. 1 in 5 sensor readings missing from aggregates.',
    goal:
      'Set allowedLateness=10s to capture the bulk of late events. Route remaining late events (>10s) to a side output for offline correction. Bring errorRate below 0.05 and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'On the window operator, set .allowedLateness(Time.seconds(10)). This keeps the window state alive for 10 extra seconds after the watermark passes the window end, catching the majority of late arrivals.',
        relatedConcept: 'allowed-lateness',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Add .sideOutputLateData(lateTag) to capture records that arrive after even the 10-second grace period. Route the side stream to an S3 sink for daily reprocessing batches.',
        relatedConcept: 'side-output',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-iot',
        name: 'IoT Device Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'keyby-device',
        name: 'KeyBy deviceId',
        parallelism: 4,
        type: 'keyBy',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'window-telemetry',
        name: 'Telemetry Window',
        parallelism: 4,
        type: 'window',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-timeseries',
        name: 'TimeSeries DB Sink',
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
      atTick: 3,
      type: 'slow-operator',
      target: 'window-telemetry',
      params: { latencyMs: 350, reason: 'late-records-dropped' },
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
      concept: 'allowed-lateness',
      title: 'Allowed Lateness',
      body: 'allowedLateness extends the lifetime of a window beyond its end time. Late records arriving within the allowed window cause the window to re-fire with updated results. The window state is retained for the duration and then discarded.',
      showWhenFixed: true,
    },
    {
      concept: 'late-records',
      title: 'Late Records Strategy',
      body: 'A complete late data strategy uses three layers: (1) allowedLateness to capture most late records inline, (2) side outputs for records arriving after the grace period, (3) periodic batch reprocessing for records captured in side outputs. Each layer has diminishing coverage and increasing cost.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-allowed-lateness',
    'configure-side-output',
    'add-late-data-sink',
    'configure-watermark-strategy',
  ],
}

export default scenario
