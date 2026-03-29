import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'alias-rollover',
  index: 14,
  title: 'The 1TB Index',
  subtitle: 'Medium-Hard · ILM & Aliases',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['index-aliases', 'ilm-rollover', 'write-alias', 'index-sizing'],

  briefing: {
    story: "The search team's write alias 'orders-write' points to a single index 'orders-000001' that has grown to 1TB with 2 billion documents. Queries take 45+ seconds. No rollover was configured. The index never grew past 50GB in testing.",
    symptom: "Average query latency is 45,000ms. The single index is 1TB with 2B docs. No ILM policy triggers rollover. The write alias still points to the original oversized index. Heap pressure is climbing.",
    goal: "Restore acceptable query performance. Average latency below 200ms and system health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "Configure an ILM rollover policy that triggers when the index exceeds 50GB or 30 days old. Point the write alias at the policy. Then manually trigger a rollover to create 'orders-000002' immediately.",
        relatedConcept: 'ilm-rollover',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "A 1TB index is too large to efficiently query. Run a forcemerge to reduce segment count, then use the reindex API to split it into smaller time-partitioned indices. Update the read alias to span multiple indices.",
        relatedConcept: 'index-aliases',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 32, diskGb: 4000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 4000 },
      { id: 'node-3', roles: ['data'], heapGb: 32, diskGb: 4000 },
    ],
    indices: [
      {
        name: 'orders-000001',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'orders-search',
        targetIndex: 'orders-000001',
        queryType: 'match',
        requestsPerSec: 200,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.78 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.75 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-3', params: { heapPct: 0.73 } },
  ],

  victoryConditions: [
    {
      id: 'latency-ok',
      description: 'Average query latency below 200ms',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 200,
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
      concept: 'index-aliases',
      title: 'Write Aliases and Rollover',
      body: "An index alias is a virtual name pointing to one or more indices. A 'write alias' points to exactly one index for indexing. When combined with ILM rollover, the write alias automatically advances to a new index when the current one hits size/age/doc limits. This keeps each index manageable in size.",
      showWhenFixed: true,
    },
    {
      concept: 'ilm-rollover',
      title: 'ILM Rollover Conditions',
      body: "Rollover triggers can include: max_age (e.g., 7d), max_size (e.g., 50gb), max_docs (e.g., 100M), max_primary_shard_size (e.g., 50gb). Set conditions based on your query patterns. For time-series logs, 7d or 50gb per shard is a common baseline.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'reindex', 'applyNodeConfig'],
}

export default scenario
