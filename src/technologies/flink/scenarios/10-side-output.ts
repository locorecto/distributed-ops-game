import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-side-output',
  index: 10,
  title: 'Late Records Silently Dropped',
  subtitle: 'Medium · Side Outputs',
  difficulty: 'medium',
  estimatedMinutes: 15,
  coverConcepts: ['side-output', 'late-data', 'window-operator', 'data-completeness'],

  briefing: {
    story:
      'The revenue reporting job uses a 5-minute tumbling window. About 15% of payment confirmations arrive late due to third-party gateway delays. These records are silently dropped by the window operator. Finance discovered a $50 K gap between reported revenue and bank reconciliation.',
    symptom:
      'errorRate around 0.15. Window operator discards late records. Downstream aggregates consistently undercount.',
    goal:
      'Configure a side output for late records on the window operator. Route them to a correction stream. Bring errorRate below 0.02 and systemHealthScore above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'Add an OutputTag<PaymentEvent>("late-payments") and configure it as the late data output on the window: window(...).sideOutputLateData(lateTag).process(...).',
        relatedConcept: 'side-output',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Retrieve the late records stream with getSideOutput(lateTag) and send it to a correction aggregation that re-applies the business logic with the late event included.',
        relatedConcept: 'late-data',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-payments',
        name: 'Payment Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'keyby-merchant',
        name: 'KeyBy merchantId',
        parallelism: 4,
        type: 'keyBy',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'window-revenue',
        name: '5-min Revenue Window',
        parallelism: 4,
        type: 'window',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'sink-reports',
        name: 'Revenue Reports Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 15000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'slow-operator',
      target: 'window-revenue',
      params: { latencyMs: 400, reason: 'late-records-dropped-silently' },
    },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
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
      concept: 'side-output',
      title: 'Side Outputs',
      body: 'Side outputs let an operator emit records to additional streams alongside the main output. Common uses: late data capture, error records, filtered subsets. The main job graph remains clean while the side stream handles exceptional data.',
      showWhenFixed: true,
    },
    {
      concept: 'late-data',
      title: 'Handling Late Data',
      body: 'Records arriving after a window closes can be: (1) dropped (default), (2) included via allowedLateness, or (3) captured via side output. Side output is the safest choice for financial data — no records are ever lost, they are just routed separately.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'configure-side-output',
    'set-output-tag',
    'set-allowed-lateness',
    'add-late-stream-sink',
  ],
}

export default scenario
