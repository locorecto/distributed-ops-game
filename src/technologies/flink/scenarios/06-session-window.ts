import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-session-window',
  index: 6,
  title: 'Session Window Gap Too Small',
  subtitle: 'Medium · Session Windows',
  difficulty: 'medium',
  estimatedMinutes: 12,
  coverConcepts: ['session-window', 'session-gap', 'user-sessions', 'window-merging'],

  briefing: {
    story:
      'The product analytics team is confused. Their dashboard shows 10x more user sessions than expected. Investigation reveals the session window gap is 1 second — users who pause for just a moment between clicks are counted as starting a new session. Mobile users trigger hundreds of micro-sessions per visit.',
    symptom:
      'systemHealthScore degraded. Error rate elevated due to downstream aggregations diverging from reality. Session count 10x above business expectation.',
    goal:
      'Increase the session gap to 30 seconds so normal user pauses do not split sessions. Bring systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'The session window is configured with EventTimeSessionWindows.withGap(Time.seconds(1)). Change this to Time.seconds(30) to reflect realistic user browsing behaviour.',
        relatedConcept: 'session-gap',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Session windows merge automatically in Flink — when a new event falls within the gap of an existing window, the windows are merged. Make sure the KeyedStream is keyed by userId before applying the session window.',
        relatedConcept: 'session-window',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-clickstream',
        name: 'Clickstream Source',
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
        id: 'window-session',
        name: 'Session Window 1s',
        parallelism: 4,
        type: 'window',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-analytics',
        name: 'Analytics Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 6, maxHeapMb: 3072 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 4,
      type: 'slow-operator',
      target: 'window-session',
      params: { latencyMs: 1200, reason: 'too-many-micro-sessions' },
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
      concept: 'session-window',
      title: 'Session Windows',
      body: 'Session windows group events that arrive within a gap threshold. If no event arrives within the gap after the last event in a session, the window closes. Flink merges windows dynamically as new events bridge previously separate sessions.',
      showWhenFixed: true,
    },
    {
      concept: 'session-gap',
      title: 'Choosing a Session Gap',
      body: 'The session gap defines the minimum inactivity period that separates two sessions. Too small and real user pauses split sessions; too large and distinct visits merge. Typical e-commerce sites use 30 minutes; real-time apps use 30–60 seconds.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-session-gap',
    'configure-window-type',
    'set-keyby-field',
    'configure-watermark-strategy',
  ],
}

export default scenario
