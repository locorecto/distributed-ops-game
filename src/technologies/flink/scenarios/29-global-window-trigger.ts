import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-29-global-window',
  index: 29,
  title: 'Global Window Memory Leak',
  subtitle: 'Master · Custom Triggers',
  difficulty: 'master',
  estimatedMinutes: 50,
  coverConcepts: ['GlobalWindow', 'custom-trigger', 'FIRE_AND_PURGE', 'window-state-cleanup', 'trigger-result'],

  briefing: {
    story:
      "A session analytics job groups user events into a GlobalWindow with a custom count-based trigger that fires every 1000 events. The trigger\'s onElement() method returns TriggerResult.FIRE when the count reaches 1000, correctly computing the session aggregate. However, the trigger returns FIRE instead of FIRE_AND_PURGE — the window accumulates all elements indefinitely because FIRE evaluates the window without clearing its state. After 72 hours of continuous operation, TaskManagers are running out of heap. JVM GC is spending 80% of its time collecting 40GB of stale window state across 500K active user sessions. The job hasn\'t crashed yet, but GC pressure is causing increasing backpressure and checkpoint timeouts.",
    symptom:
      'TaskManager heap usage grows at ~550MB/hour. JVM GC overhead above 75%. Checkpoint duration climbing from 800ms to 22 seconds over 72 hours as state size grows. Heap pressure metric above 0.85. Each of 500K user sessions holds an unbounded accumulation of historical events.',
    goal:
      'Fix the custom trigger to return FIRE_AND_PURGE instead of FIRE, add state TTL as a secondary safeguard for sessions that never reach 1000 events, and confirm that heap usage stabilizes after the fix is deployed via a savepoint.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'The fix is a one-line change: return TriggerResult.FIRE_AND_PURGE instead of TriggerResult.FIRE in onElement(). FIRE evaluates the window function but retains all accumulated elements. FIRE_AND_PURGE evaluates AND clears the window state, freeing memory.',
        relatedConcept: 'FIRE_AND_PURGE',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Add state TTL (StateTtlConfig) to the window state descriptor as a safety net. Sessions that never reach 1000 events (e.g., users who abandon mid-session) would otherwise hold state forever. A TTL of 24 hours ensures stale sessions are eventually evicted.',
        relatedConcept: 'window-state-cleanup',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: 'Consider whether GlobalWindow is the right abstraction here. If sessions have a maximum expected duration, a session window with a gap timeout would provide automatic cleanup without requiring custom TTL logic.',
        relatedConcept: 'GlobalWindow',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-events',
        name: 'User Event Source',
        parallelism: 8,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'keyby-user',
        name: 'KeyBy User ID',
        parallelism: 8,
        type: 'keyBy',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'window-global-count',
        name: 'Global Count Window',
        parallelism: 8,
        type: 'window',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-sessions',
        name: 'Session Analytics Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 16384 },
      { id: 'tm-2', slots: 8, maxHeapMb: 16384 },
      { id: 'tm-3', slots: 8, maxHeapMb: 16384 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 1,
      type: 'state-growth',
      target: 'window-global-count',
      params: { growthRateMbPerHour: 550, currentStateSizeMb: 40960, triggerMode: 'FIRE', shouldBe: 'FIRE_AND_PURGE' },
    },
    {
      atTick: 3,
      type: 'heap-pressure',
      target: 'tm-1',
      params: { heapPressure: 0.87, gcOverheadPercent: 80 },
    },
    {
      atTick: 5,
      type: 'checkpoint-duration-spike',
      target: 'window-global-count',
      params: { durationMs: 22000, reason: 'excessive-state-size' },
    },
  ],

  victoryConditions: [
    {
      id: 'heap-stable',
      description: 'Heap pressure below 0.5 and stable',
      required: true,
      check: s => s.metrics.heapPressure < 0.5,
    },
    {
      id: 'checkpoint-duration-ok',
      description: 'Checkpoint duration below 2 seconds',
      required: true,
      check: s => s.metrics.checkpointDurationMs < 2000,
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
      concept: 'FIRE_AND_PURGE',
      title: 'TriggerResult: FIRE vs FIRE_AND_PURGE',
      body: 'A Flink window trigger returns one of four TriggerResult values: CONTINUE (do nothing), FIRE (evaluate window function, keep state), PURGE (clear state without evaluating), or FIRE_AND_PURGE (evaluate and clear). For count-based triggers where you want to process a batch and start fresh, always return FIRE_AND_PURGE. Returning FIRE causes unbounded state accumulation.',
      showWhenFixed: true,
    },
    {
      concept: 'window-state-cleanup',
      title: 'Window State Cleanup & TTL',
      body: 'Window state persists until the trigger purges it. For windows that may never reach their fire condition (e.g., a count trigger for users who abandon mid-session), state will accumulate forever. State TTL (StateTtlConfig) adds a time-based expiry as a safety net. Configure it on the window state descriptor with an appropriate TTL and cleanup strategy.',
      showWhenFixed: true,
    },
    {
      concept: 'GlobalWindow',
      title: 'GlobalWindow and Custom Triggers',
      body: 'GlobalWindow assigns all elements to a single window per key with no built-in expiry. It is designed for use with custom triggers that define when to fire and purge. Without a trigger that purges, GlobalWindow will accumulate all elements for the lifetime of the job. Contrast with TimeWindow (tumbling/sliding) and SessionWindow, which have built-in cleanup.',
      showWhenFixed: false,
    },
  ],

  availableActions: ['fix-trigger-to-fire-and-purge', 'add-state-ttl', 'reduce-window-scope'],
}

export default scenario
