import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-sliding-window',
  index: 5,
  title: 'Sliding Window Memory Explosion',
  subtitle: 'Medium · Window Types',
  difficulty: 'medium',
  estimatedMinutes: 12,
  coverConcepts: ['sliding-window', 'window-panes', 'memory-overhead', 'tumbling-window'],

  briefing: {
    story:
      'An alerting job uses a sliding window (size=1h, slide=1m) to compute moving averages of sensor readings. Memory usage shot up 60x versus estimates. The on-call engineer just got paged — heap is at 94%.',
    symptom:
      'heapPressure > 0.90. backpressureRatio > 0.7. Sliding window operator state growing rapidly because each event is stored in 60 overlapping panes.',
    goal:
      'Reduce backpressureRatio below 0.2 and systemHealthScore above 80 by switching to a tumbling window or reducing slide frequency.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'A sliding window of size=1h and slide=1m creates 60 panes per event (size/slide = 60). Each pane stores its own copy of every record it covers. Try increasing the slide to 15m — that cuts pane count to 4.',
        relatedConcept: 'sliding-window',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Alternatively, replace the sliding window with a tumbling window and compute the rolling average using an AggregateFunction that maintains running state — no per-pane copies needed.',
        relatedConcept: 'tumbling-window',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-sensors',
        name: 'Sensor Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'keyby-sensor',
        name: 'KeyBy sensorId',
        parallelism: 4,
        type: 'keyBy',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'window-sliding',
        name: 'Sliding Window 1h/1m',
        parallelism: 4,
        type: 'window',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'sink-alerts',
        name: 'Alert Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 3072 },
      { id: 'tm-2', slots: 8, maxHeapMb: 3072 },
    ],
    checkpointIntervalMs: 15000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'state-backend-oom',
      target: 'window-sliding',
      params: { stateSizeMb: 2800, reason: '60-panes-per-event' },
    },
    {
      atTick: 5,
      type: 'backpressure-spike',
      target: 'window-sliding',
      params: { ratio: 0.85 },
    },
  ],

  victoryConditions: [
    {
      id: 'backpressure-low',
      description: 'Backpressure ratio below 0.2',
      required: true,
      check: s => s.metrics.backpressureRatio < 0.2,
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
      concept: 'sliding-window',
      title: 'Sliding Window Pane Overhead',
      body: 'Flink implements sliding windows using panes. For a window of size W and slide S, each event is placed into W/S panes. With W=1h and S=1m that is 60 panes — multiplying state 60x. Increase the slide interval or switch to an incremental aggregate to cut memory.',
      showWhenFixed: true,
    },
    {
      concept: 'window-panes',
      title: 'Window Panes',
      body: 'A pane is the fundamental unit of window state in Flink. For non-overlapping windows (tumbling, session) each event lands in exactly one pane. For sliding windows, events land in multiple panes, which is the root cause of the memory explosion.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-window-type',
    'set-window-slide',
    'set-window-size',
    'switch-aggregate-function',
  ],
}

export default scenario
