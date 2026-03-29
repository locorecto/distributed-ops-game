import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'deep-pagination',
  index: 19,
  title: 'Page 10,000 of Doom',
  subtitle: 'Hard · Pagination',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['deep-pagination', 'search-after', 'point-in-time', 'scroll-api', 'from-size'],

  briefing: {
    story: "The product export feature allows users to paginate through all 10 million products using standard from+size pagination. At 10,000 concurrent users all paginating deeply (offset 100,000+), every node OOMs. The heap fills with the priority queues needed to sort and merge deep pages.",
    symptom: "Heap pressure exceeds 90% when deep pagination requests arrive. Each from+size=100,000 request forces each shard to fetch and sort 100,000 docs, then the coordinating node merges all shards' results. With 10 shards and 100K offset = 1M intermediate results per request.",
    goal: "Prevent deep pagination OOM. Heap pressure below 80% and average latency below 500ms.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "Replace from+size pagination with search_after. search_after uses the last result's sort values as the cursor for the next page — it doesn't require fetching and discarding all previous results. This is O(1) memory regardless of page depth.",
        relatedConcept: 'search-after',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "For consistent deep pagination (where the index is actively changing), combine search_after with a Point-in-Time (PIT) ID. Open the PIT with POST /products/_pit?keep_alive=1m, use its id in queries. This gives a stable view of the data across pages.",
        relatedConcept: 'point-in-time',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data', 'coordinating'], heapGb: 32, diskGb: 2000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-3', roles: ['data'], heapGb: 32, diskGb: 2000 },
    ],
    indices: [
      {
        name: 'products',
        shards: 10,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 100000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'export-service',
        targetIndex: 'products',
        queryType: 'scroll',
        requestsPerSec: 100,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'query-flood', target: 'cluster', params: {} },
    { atTick: 3, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.92 } },
    { atTick: 3, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.89 } },
    { atTick: 3, type: 'heap-pressure', target: 'node-3', params: { heapPct: 0.87 } },
  ],

  victoryConditions: [
    {
      id: 'heap-ok',
      description: 'Heap pressure below 80%',
      required: true,
      check: s => s.metrics.heapPressure < 0.8,
    },
    {
      id: 'latency-ok',
      description: 'Average query latency below 500ms',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 500,
    },
  ],

  conceptCards: [
    {
      concept: 'deep-pagination',
      title: 'The from+size Problem',
      body: "from+size pagination requires Elasticsearch to fetch (from+size) documents from each shard and merge them on the coordinating node. At from=100,000 and 10 shards, the coordinating node handles 1,000,000 intermediate results per request. This is O(N) memory per request — catastrophic at scale.",
      showWhenFixed: true,
    },
    {
      concept: 'search-after',
      title: 'search_after: Cursor-Based Pagination',
      body: "search_after uses the sort values of the last result as the starting point for the next page. The shard only needs to find documents after that cursor position — O(log N) per shard, O(1) coordinating memory. Combine with a PIT for consistency across pages in a changing index.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig'],
}

export default scenario
