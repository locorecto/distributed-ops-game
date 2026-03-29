import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-30-unified-batch',
  index: 30,
  title: 'Batch Backfill Blocks Streaming',
  subtitle: 'Master · Unified Batch + Streaming',
  difficulty: 'master',
  estimatedMinutes: 55,
  coverConcepts: ['BATCH-execution-mode', 'bounded-source', 'streaming-vs-batch', 'execution-environment', 'hybrid-pipeline'],

  briefing: {
    story:
      "Your data team needs to backfill 6TB of historical Kafka data into the analytics warehouse using the same Flink job logic as the live streaming pipeline. They submitted the backfill job with execution.runtime-mode: STREAMING — the default. In STREAMING mode, a bounded Kafka source (with a fixed end offset) reads all historical records but never signals completion: the source subtasks remain open waiting for more data, watermarks never advance to Watermark.MAX_WATERMARK, and time-based windows never fire their final trigger. After 12 hours of processing, zero records have been emitted to the sink. The 6TB of events are stuck in window state, fully accumulated but never output. The fix: switch the execution runtime mode to BATCH for bounded sources. In BATCH mode, Flink processes bounded inputs to completion, advances watermarks to MAX at end-of-input, fires all pending windows, and terminates cleanly.",
    symptom:
      'Backfill job running for 12 hours with 0 records emitted to sink. Window operators show large state (estimated 180GB across all TaskManagers) but outputRate of 0. Watermark lag is MAX_LONG (watermarks never advancing). Source subtasks are in RUNNING state consuming no new data but not terminating. Live streaming job on the same cluster is unaffected but competing for resources.',
    goal:
      'Set the backfill job execution runtime mode to BATCH, configure the Kafka source with a bounded end offset, optionally isolate the backfill to a separate cluster to avoid resource contention with the live streaming job, and confirm that all 6TB of historical data is processed and output within a predictable time window.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'The core fix: set execution.runtime-mode to BATCH in the Flink configuration or via StreamExecutionEnvironment.setRuntimeMode(RuntimeExecutionMode.BATCH). In BATCH mode, Flink knows the source is bounded, can sort and process records optimally, and advances watermarks to MAX at end-of-input so all windows fire.',
        relatedConcept: 'BATCH-execution-mode',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'The Kafka source must be configured as a bounded source with an explicit end offset (e.g., OffsetsInitializer.latest() as the stopping offset, or a specific timestamp offset). Without a stopping offset, even in BATCH mode the source is treated as unbounded.',
        relatedConcept: 'bounded-source',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: 'Running a 6TB batch job on the same cluster as the live streaming pipeline will cause resource contention. Use separate-batch-cluster to submit the backfill to a dedicated Flink cluster or use Flink\'s per-job mode to isolate resources.',
        relatedConcept: 'hybrid-pipeline',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-kafka-bounded',
        name: 'Bounded Kafka Source',
        parallelism: 16,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'map-transform',
        name: 'Historical Transform',
        parallelism: 16,
        type: 'map',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'window-tumbling-1h',
        name: '1-Hour Tumbling Window',
        parallelism: 16,
        type: 'window',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 30000,
      },
      {
        id: 'sink-warehouse',
        name: 'Warehouse Sink',
        parallelism: 8,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 30000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 16, maxHeapMb: 32768 },
      { id: 'tm-2', slots: 16, maxHeapMb: 32768 },
      { id: 'tm-3', slots: 16, maxHeapMb: 32768 },
      { id: 'tm-4', slots: 16, maxHeapMb: 32768 },
    ],
    checkpointIntervalMs: 30000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 1,
      type: 'watermark-stall',
      target: 'source-kafka-bounded',
      params: { reason: 'streaming-mode-on-bounded-source', watermarkLagMs: 9007199254740991, outputRate: 0 },
    },
    {
      atTick: 2,
      type: 'window-never-fires',
      target: 'window-tumbling-1h',
      params: { stateAccumulatedMb: 184320, outputRecords: 0, hoursRunning: 12 },
    },
    {
      atTick: 4,
      type: 'resource-contention',
      target: 'tm-1',
      params: { affectedJob: 'live-streaming-pipeline', cpuStealPercent: 35 },
    },
  ],

  victoryConditions: [
    {
      id: 'records-emitted',
      description: 'Backfill job emitting records to sink',
      required: true,
      check: s => s.metrics.recordsPerSecond > 10000,
    },
    {
      id: 'watermark-advancing',
      description: 'Watermarks advancing through historical data',
      required: true,
      check: s => s.metrics.watermarkLag < 3600000,
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
      concept: 'BATCH-execution-mode',
      title: 'Batch Execution Mode in Flink',
      body: "Flink's unified API supports three runtime modes: STREAMING (unbounded, continuous), BATCH (bounded, batch-optimal), and AUTOMATIC (infer from source boundedness). In BATCH mode: sources signal end-of-input when exhausted, watermarks advance to MAX_WATERMARK automatically, all pending windows fire, and the job terminates. Operators can also be optimized differently (e.g., sort-based joins instead of hash joins for large state).",
      showWhenFixed: true,
    },
    {
      concept: 'bounded-source',
      title: 'Bounded Sources & Stopping Offsets',
      body: 'A Kafka source becomes bounded by specifying a stopping offset: a timestamp, a specific partition offset, or the latest offset at job submission time. The KafkaSource builder method setBounded(OffsetsInitializer stoppingOffsets) marks the source as bounded. Without a stopping offset, the source runs indefinitely in both STREAMING and BATCH mode.',
      showWhenFixed: true,
    },
    {
      concept: 'hybrid-pipeline',
      title: 'Batch + Streaming Hybrid Pipelines',
      body: "Running batch backfills alongside live streaming on the same cluster risks resource starvation. Best practices: (1) use separate clusters or Flink Application Mode for isolation, (2) configure task slot sharing groups to limit resource overlap, or (3) schedule batch jobs during off-peak hours. Flink's Hybrid Source (KafkaHybridSource) can also seamlessly transition from batch historical processing to streaming live data in a single job.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['set-batch-execution-mode', 'configure-bounded-source', 'separate-batch-cluster'],
}

export default scenario
