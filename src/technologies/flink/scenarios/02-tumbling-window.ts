import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-tumbling-window',
  index: 2,
  title: 'Tumbling Window Late Data',
  subtitle: 'Easy · Window Semantics',
  difficulty: 'easy',
  estimatedMinutes: 8,
  coverConcepts: ['tumbling-window', 'allowed-lateness', 'late-data', 'event-time'],

  briefing: {
    story:
      'The sales aggregation job counts orders per 1-minute tumbling window. With mobile clients on flaky networks, 15 % of events arrive 5 seconds late. Those orders silently vanish from the counts, and the finance team keeps finding discrepancies.',
    symptom:
      'Error rate around 0.15. System health degraded. Window results missing a predictable fraction of records.',
    goal:
      'Bring systemHealthScore above 80 by configuring allowedLateness so late records are included in the correct window.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'Late records arrive up to 5 seconds after the window closes. Set allowedLateness = 5 seconds on the window operator — Flink will re-fire the window result when late data arrives.',
        relatedConcept: 'allowed-lateness',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Also make sure the job uses event-time semantics with a periodic watermark strategy. Without event-time, allowedLateness has no effect.',
        relatedConcept: 'event-time',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-orders',
        name: 'Order Source',
        parallelism: 2,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'window-count',
        name: '1-min Tumbling Window',
        parallelism: 2,
        type: 'window',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-results',
        name: 'Results Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 4, maxHeapMb: 2048 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'slow-operator',
      target: 'window-count',
      params: { latencyMs: 800, reason: 'late-records-dropped' },
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
      concept: 'tumbling-window',
      title: 'Tumbling Windows',
      body: 'A tumbling window divides the stream into non-overlapping, fixed-size time buckets. Each event belongs to exactly one window. The window fires when the watermark passes the window end time.',
      showWhenFixed: false,
    },
    {
      concept: 'allowed-lateness',
      title: 'Allowed Lateness',
      body: 'allowedLateness keeps a window\'s state alive for an additional duration after it fires. When a late record arrives within the allowed period, the window re-fires with the updated result. This balances completeness against state retention cost.',
      showWhenFixed: true,
    },
  ],

  availableActions: [
    'set-allowed-lateness',
    'configure-watermark-strategy',
    'set-window-type',
    'enable-side-output',
  ],
}

export default scenario
