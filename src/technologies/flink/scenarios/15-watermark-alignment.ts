import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-watermark-alignment',
  index: 15,
  title: 'Watermark Skew Between Kafka Sources',
  subtitle: 'Medium-Hard · Watermark Alignment',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['watermark-alignment', 'multi-source', 'watermark-skew', 'idle-source'],

  briefing: {
    story:
      'The unified analytics job reads from two Kafka topics: "high-volume-clicks" (10 K events/s) and "low-volume-purchases" (10 events/s). The click source watermark races 30 minutes ahead of the purchase source. Any purchase arriving within that 30-minute window is treated as late and dropped.',
    symptom:
      'watermarkLag above 1800000 ms. errorRate elevated from dropped purchase events. Joins producing incomplete results.',
    goal:
      'Enable watermark alignment with a max-drift of 500 ms. Bring watermarkLag below 1000 ms and systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Enable WatermarkStrategy.withWatermarkAlignment("same-group", Duration.ofMillis(500), Duration.ofMillis(200)) on both sources. Flink will pause the fast source until the slow source catches up within 500 ms.',
        relatedConcept: 'watermark-alignment',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Also handle the case where the purchase source goes idle (no events for a long period). Use WatermarkStrategy.withIdleness(Duration.ofSeconds(30)) to prevent the idle source from blocking watermark advancement.',
        relatedConcept: 'idle-source',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-clicks',
        name: 'Click Events Source',
        parallelism: 8,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'source-purchases',
        name: 'Purchase Events Source',
        parallelism: 1,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'join-unified',
        name: 'Unified Analytics Join',
        parallelism: 8,
        type: 'aggregate',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-analytics',
        name: 'Analytics Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 10, maxHeapMb: 4096 },
      { id: 'tm-2', slots: 10, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'watermark-stall',
      target: 'source-purchases',
      params: { lagMs: 1800000, reason: 'low-volume-source-watermark-lag' },
    },
  ],

  victoryConditions: [
    {
      id: 'watermark-ok',
      description: 'Watermark lag below 1000ms',
      required: true,
      check: s => s.metrics.watermarkLag < 1000,
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
      concept: 'watermark-alignment',
      title: 'Watermark Alignment',
      body: 'Flink 1.15 introduced watermark alignment. When enabled, the source with the fastest-advancing watermark is paused until all sources in the alignment group are within the configured max-drift. This prevents fast sources from making all records from slow sources appear late.',
      showWhenFixed: true,
    },
    {
      concept: 'idle-source',
      title: 'Handling Idle Sources',
      body: 'A source with no incoming events does not advance its watermark. If other sources advance far ahead, this blocks window progression across the job. withIdleness() marks a source as idle after a timeout, allowing downstream watermarks to advance past the idle source.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'enable-watermark-alignment',
    'set-max-drift',
    'set-source-idleness',
    'configure-watermark-strategy',
  ],
}

export default scenario
