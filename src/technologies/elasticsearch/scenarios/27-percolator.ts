import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'es-27-percolator',
  index: 27,
  title: 'Percolator Alert Backlog',
  subtitle: 'Expert · Percolator Queries',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['percolator', 'reverse-search', 'stored-queries', 'document-matching'],

  briefing: {
    story: "An alerting system stores 50,000 percolator queries that match incoming log events. After an Elasticsearch upgrade, percolator performance collapsed — matching 100 events/sec now takes 45 seconds per batch instead of 200ms. Alert backlog: 500,000 events. The problem is too many percolator queries without query caching, plus a missing `query` field mapping.",
    symptom: "Percolation latency spiked from 200ms to 45,000ms per batch of 100 events. Alert backlog has grown to 500,000 unprocessed events. The `query` field in the percolator index is not mapped as `percolator` type, causing full re-parse on every match attempt. Query cache hit rate is 0%.",
    goal: "Reduce percolation latency below 500ms per batch and drain the alert backlog. System health must be above 75.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "Check your percolator index mapping. The `query` field must be explicitly mapped as type `percolator`. Without it, Elasticsearch cannot cache parsed query structures between percolation requests — every batch re-parses all 50,000 queries from scratch.",
        relatedConcept: 'percolator',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Enable the query cache on the percolator index with `index.queries.cache.enabled: true`. Then audit your 50,000 stored queries — many may be duplicates or low-value alerts. Reducing the active query count directly lowers percolation cost.",
        relatedConcept: 'stored-queries',
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
        name: 'alert-percolator',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
      {
        name: 'log-events',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'alert-engine',
        targetIndex: 'alert-percolator',
        queryType: 'match',
        requestsPerSec: 100,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.82 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.79 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-3', params: { heapPct: 0.76 } },
  ],

  victoryConditions: [
    {
      id: 'latency-ok',
      description: 'Percolation latency below 500ms per batch',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 500,
    },
    {
      id: 'health-good',
      description: 'System health above 75',
      required: true,
      check: s => s.systemHealthScore > 75,
    },
  ],

  conceptCards: [
    {
      concept: 'percolator',
      title: 'Percolator: Reverse Search',
      body: "Normal search finds documents matching a query. Percolator does the reverse — it finds stored queries that match an incoming document. The `percolator` field type is required for the field storing query definitions. It pre-parses and caches query structures at index time, so percolation at query time is fast. Without the correct mapping, all 50,000 queries re-parse on every request.",
      showWhenFixed: true,
    },
    {
      concept: 'stored-queries',
      title: 'Managing Percolator Query Count',
      body: "Every percolation request evaluates every stored query against the candidate document. Percolation cost scales linearly with query count. The query cache (`index.queries.cache.enabled: true`) avoids re-compiling Lucene queries between requests, but the fundamental cost is O(queries × documents). Pruning stale or duplicate queries is the most effective long-term optimization.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['optimize-percolator-mapping', 'enable-query-cache', 'reduce-percolator-count'],
}

export default scenario
