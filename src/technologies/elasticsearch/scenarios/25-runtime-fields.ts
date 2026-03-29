import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'runtime-fields',
  index: 25,
  title: 'The Script That Ate the Cluster',
  subtitle: 'Expert · Runtime Fields',
  difficulty: 'expert',
  estimatedMinutes: 30,
  coverConcepts: ['runtime-fields', 'painless', 'doc-values', 'index-time-vs-query-time'],

  briefing: {
    story: "A developer added a runtime field that uses a Painless script to compute a 'discounted_price' value: 'price * (1 - discount_pct)'. The field is correct but querying it against 50 million products takes 50 seconds — each document executes the script, multiplying 50M × 1ms/script = 50 seconds.",
    symptom: "Average query latency is 50,000ms for any query using the 'discounted_price' runtime field. Heap pressure is elevated from script compilation caching. The nightly report that uses this field is timing out.",
    goal: "Optimize the computed field. Average query latency below 200ms.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Runtime fields compute values at query time on every matched document. For 50M documents, even a 1ms script = 50 seconds. The fix: materialize the computed value at index time as a regular field. Add 'discounted_price' to the mapping and compute it in the ingest pipeline.",
        relatedConcept: 'index-time-vs-query-time',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Alternative: use a doc_values based approach. If the script uses only doc_values fields (price, discount_pct as keyword won't have doc_values — use double/float), the access is columnar and much faster. But materializing at index time remains the fastest option for frequently-queried computed values.",
        relatedConcept: 'doc-values',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-3', roles: ['data'], heapGb: 32, diskGb: 2000 },
    ],
    indices: [
      {
        name: 'products',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 30000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'pricing-dashboard',
        targetIndex: 'products',
        queryType: 'aggregation',
        requestsPerSec: 20,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.75 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.72 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-3', params: { heapPct: 0.70 } },
    { atTick: 3, type: 'query-flood', target: 'cluster', params: {} },
  ],

  victoryConditions: [
    {
      id: 'latency-ok',
      description: 'Average query latency below 200ms',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 200,
    },
  ],

  conceptCards: [
    {
      concept: 'runtime-fields',
      title: 'Runtime Fields: Power and Cost',
      body: "Runtime fields are computed at query time using Painless scripts. They're great for schema-on-read flexibility: add a field without reindexing. But they're expensive — the script runs for every document that matches the query's filter. For frequently-queried computed values, materialize at index time.",
      showWhenFixed: true,
    },
    {
      concept: 'painless',
      title: 'Painless Script Performance',
      body: "Painless compiles scripts to Java bytecode and caches them. Script execution is fast per-call (~0.1ms) but adds up at scale. Use scripts only when necessary. For aggregations on computed values, a dedicated pipeline field using an ingest processor is orders of magnitude faster.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig', 'reindex'],
}

export default scenario
