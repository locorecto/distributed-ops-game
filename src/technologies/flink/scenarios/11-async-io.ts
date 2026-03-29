import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-async-io',
  index: 11,
  title: 'Synchronous DB Lookups Blocking Operator',
  subtitle: 'Medium-Hard · Async I/O',
  difficulty: 'medium-hard',
  estimatedMinutes: 18,
  coverConcepts: ['async-io', 'async-function', 'operator-throughput', 'latency'],

  briefing: {
    story:
      'The product lookup job enriches order events with product metadata from Redis. The map operator makes synchronous Redis calls — each call takes 20 ms. At 10 000 records/s the operator is a wall of blocking I/O: one thread, one request at a time, 200 ms average latency and climbing.',
    symptom:
      'latencyMs above 10000. backpressureRatio above 0.8. Source is throttled waiting for the map operator to catch up.',
    goal:
      'Wrap the Redis lookup in AsyncFunction with capacity=100 inflight requests. Bring latencyMs below 200 and backpressureRatio below 0.1.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Replace the blocking MapFunction with an AsyncRichFunction. Use an async Redis client (Lettuce/Redisson) and call AsyncDataStream.unorderedWait(stream, asyncFunc, 5, TimeUnit.SECONDS, 100).',
        relatedConcept: 'async-function',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Set capacity=100 to allow 100 inflight requests per operator instance. Choose unorderedWait if downstream ordering does not matter — it has lower latency than orderedWait.',
        relatedConcept: 'async-io',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-orders',
        name: 'Order Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-enrich',
        name: 'Product Lookup (sync)',
        parallelism: 4,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-enriched',
        name: 'Enriched Orders Sink',
        parallelism: 4,
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
      atTick: 2,
      type: 'slow-operator',
      target: 'map-enrich',
      params: { latencyMs: 10500, reason: 'synchronous-blocking-redis-calls' },
    },
    {
      atTick: 3,
      type: 'backpressure-spike',
      target: 'map-enrich',
      params: { ratio: 0.88 },
    },
  ],

  victoryConditions: [
    {
      id: 'latency-low',
      description: 'End-to-end latency below 200ms',
      required: true,
      check: s => s.metrics.latencyMs < 200,
    },
    {
      id: 'backpressure-low',
      description: 'Backpressure ratio below 0.1',
      required: true,
      check: s => s.metrics.backpressureRatio < 0.1,
    },
  ],

  conceptCards: [
    {
      concept: 'async-io',
      title: 'Async I/O API',
      body: 'AsyncDataStream.unorderedWait wraps any async operation. Flink maintains a queue of inflight futures; when one completes the result is collected. A single operator thread can have hundreds of concurrent I/O requests in flight.',
      showWhenFixed: true,
    },
    {
      concept: 'async-function',
      title: 'AsyncRichFunction',
      body: 'Implement AsyncRichFunction<IN,OUT> and override asyncInvoke(). Call the async client, and when the response arrives, call ResultFuture.complete() with the result. Always call complete() even on errors to avoid hanging the operator.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'enable-async-io',
    'set-async-capacity',
    'set-async-timeout',
    'choose-order-mode',
  ],
}

export default scenario
