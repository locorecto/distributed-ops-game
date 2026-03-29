import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'over-sharding',
  index: 5,
  title: 'Shard Explosion',
  subtitle: 'Medium · Shard Management',
  difficulty: 'medium',
  estimatedMinutes: 15,
  coverConcepts: ['over-sharding', 'heap-usage', 'shard-sizing', 'rollup'],

  briefing: {
    story: "The analytics team created 1000 indices — one per customer — each with 5 shards and 1 replica. That's 10,000 shards across 3 nodes (3,333 shards/node). Each shard consumes ~400MB of heap. The cluster is running out of memory and nodes are crashing with OOM errors.",
    symptom: "Heap pressure is above 90% on all nodes. JVM GC is running constantly. Query latency has exploded to 10+ seconds. Nodes are crashing and being marked offline.",
    goal: "Reduce heap pressure below 70% and restore system health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Each shard has a base overhead of ~400MB heap for Lucene segments and index metadata. With 3,333 shards per node × 400MB = 1.3TB required heap, but nodes only have 8GB. Drastically reduce shard count.",
        relatedConcept: 'shard-sizing',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Reduce each index to 1 primary shard (small indices don't need more). Consider merging low-volume customer indices into shared indices with a 'customer_id' field for filtering. Aim for 10-50GB per shard.",
        relatedConcept: 'over-sharding',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 8, diskGb: 2000 },
      { id: 'node-2', roles: ['data'], heapGb: 8, diskGb: 2000 },
      { id: 'node-3', roles: ['data'], heapGb: 8, diskGb: 2000 },
    ],
    indices: [
      {
        name: 'customers-combined',
        shards: 50,
        replicas: 1,
        refreshIntervalMs: 30000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'analytics-app',
        targetIndex: 'customers-combined',
        queryType: 'aggregation',
        requestsPerSec: 20,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.92 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.90 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-3', params: { heapPct: 0.88 } },
    { atTick: 5, type: 'circuit-breaker', target: 'cluster', params: {} },
  ],

  victoryConditions: [
    {
      id: 'heap-low',
      description: 'Heap pressure below 70%',
      required: true,
      check: s => s.metrics.heapPressure < 0.7,
    },
    {
      id: 'health-good',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'over-sharding',
      title: 'The Over-Sharding Problem',
      body: "Every shard is a Lucene index consuming ~400MB heap for segment metadata, regardless of size. A cluster with 10,000 tiny shards will OOM before the shards hold any real data. Rule of thumb: 10-50GB per shard, and no more than 20 shards per GB of heap.",
      showWhenFixed: true,
    },
    {
      concept: 'shard-sizing',
      title: 'Right-Sizing Shards',
      body: "For time-series data, use date-math index names (logs-2024.01.01) with ILM to control growth. For per-tenant data, use a shared index with a tenant_id field unless tenants have radically different data volumes. Merge small indices where possible.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig', 'shrinkIndex'],
}

export default scenario
