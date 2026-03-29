import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'aggregation-oom',
  index: 9,
  title: 'Aggregation OOM',
  subtitle: 'Medium · Aggregations',
  difficulty: 'medium',
  estimatedMinutes: 18,
  coverConcepts: ['terms-aggregation', 'fielddata', 'circuit-breaker', 'cardinality', 'sampler-aggregation'],

  briefing: {
    story: "The data science team runs nightly reports using a terms aggregation on the 'userId' field with 50 million unique values. Every night at 2am, the aggregation triggers the fielddata circuit breaker and crashes nodes, taking the cluster red until morning.",
    symptom: "Fielddata circuit breaker trips during terms aggregation. Heap usage spikes to 95%+ as ES tries to load 50M unique userId values into memory. Nodes crash. Cluster goes red. Morning dashboards show no data.",
    goal: "Prevent the OOM. Reduce heap pressure below 75% and error rate below 2%.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "Terms aggregations on high-cardinality fields load all unique values into heap (fielddata). With 50M unique userIds, this is hundreds of GBs. Switch to a 'sampler' aggregation to analyze a representative sample instead.",
        relatedConcept: 'cardinality',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Add indices.breaker.fielddata.limit to cap fielddata at 40% of heap. For analytics requiring exact counts, use 'cardinality' aggregation which uses HyperLogLog++ (accurate to ~3% error but uses only ~80KB of memory).",
        relatedConcept: 'sampler-aggregation',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 2000 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 2000 },
      { id: 'node-3', roles: ['data'], heapGb: 16, diskGb: 2000 },
    ],
    indices: [
      {
        name: 'events',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: 'events-ilm',
      },
    ],
    clients: [
      {
        id: 'analytics-service',
        targetIndex: 'events',
        queryType: 'aggregation',
        requestsPerSec: 10,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.88 } },
    { atTick: 3, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.91 } },
    { atTick: 3, type: 'heap-pressure', target: 'node-3', params: { heapPct: 0.86 } },
    { atTick: 5, type: 'circuit-breaker', target: 'cluster', params: {} },
  ],

  victoryConditions: [
    {
      id: 'heap-ok',
      description: 'Heap pressure below 75%',
      required: true,
      check: s => s.metrics.heapPressure < 0.75,
    },
    {
      id: 'error-rate-low',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
    },
  ],

  conceptCards: [
    {
      concept: 'terms-aggregation',
      title: 'Terms Aggregation Memory Cost',
      body: "A terms aggregation on a high-cardinality field loads all unique values into fielddata (heap). For 50M unique values at ~50 bytes each = 2.5GB per shard. With 5 shards, that's 12.5GB heap consumed by one query. This kills the cluster.",
      showWhenFixed: true,
    },
    {
      concept: 'sampler-aggregation',
      title: 'Sampler and Cardinality Aggregations',
      body: "The 'sampler' aggregation limits the number of documents fed to sub-aggregations to a representative sample (e.g., 5000 docs). The 'cardinality' aggregation uses HyperLogLog++ to estimate distinct count with ~3% error, using only 80KB of memory — orders of magnitude cheaper than terms.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyNodeConfig', 'applyIndexConfig'],
}

export default scenario
