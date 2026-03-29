import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'slow-query',
  index: 3,
  title: 'The 30-Second Search',
  subtitle: 'Easy · Query Optimization',
  difficulty: 'easy',
  estimatedMinutes: 10,
  coverConcepts: ['query-types', 'field-mapping', 'sort-optimization', 'keyword-field'],

  briefing: {
    story: "The search team's new product listing page is painfully slow. Users are waiting 30+ seconds for results. The SLA is 200ms. The engineers are using a match_all query sorted by a 'description' text field — which has no doc_values.",
    symptom: "Average query latency is 30,000ms. The query uses match_all with a sort on a non-indexed text field, forcing Elasticsearch to load all field data into heap on every request.",
    goal: "Reduce average query latency below 50ms.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The sort is the problem. Sorting on a 'text' field requires loading all values into fielddata (heap), which is extremely slow for large indices. Switch to a 'keyword' sub-field or a numeric field for sorting.",
        relatedConcept: 'sort-optimization',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Replace match_all with a term query on an indexed keyword field. Add a 'keyword' multi-field to 'name' in your mapping for fast sort and exact match. This avoids full-collection scans.",
        relatedConcept: 'keyword-field',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 8, diskGb: 500 },
      { id: 'node-2', roles: ['data'], heapGb: 8, diskGb: 500 },
    ],
    indices: [
      {
        name: 'products',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'search-app',
        targetIndex: 'products',
        queryType: 'match',
        requestsPerSec: 100,
      },
    ],
  },

  failureScript: [
    { atTick: 2, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.82 } },
    { atTick: 2, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.79 } },
  ],

  victoryConditions: [
    {
      id: 'latency-low',
      description: 'Average query latency below 50ms',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 50,
    },
  ],

  conceptCards: [
    {
      concept: 'fielddata',
      title: 'Fielddata and Sorting',
      body: "Sorting on a 'text' field requires enabling fielddata, which loads all values into heap memory. This is slow and memory-hungry. For sorting and aggregations, always use 'keyword' fields or numeric fields which use doc_values (on-disk columnar storage) instead.",
      showWhenFixed: true,
    },
    {
      concept: 'query-types',
      title: 'Choosing the Right Query',
      body: "match_all scans every document. term queries use the inverted index for O(log n) lookups. match queries are analyzed and use the inverted index. For structured data like IDs, prices, and categories, always prefer term/range queries over match.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig'],
}

export default scenario
