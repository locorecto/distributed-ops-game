import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'relevance-tuning',
  index: 6,
  title: 'Search Gone Wrong',
  subtitle: 'Medium · Relevance Tuning',
  difficulty: 'medium',
  estimatedMinutes: 15,
  coverConcepts: ['relevance', 'field-boosting', 'multi-match', 'tie-breaker', 'bm25'],

  briefing: {
    story: "The e-commerce search team launched their new product search, but users are complaining that irrelevant products appear at the top. A search for 'Apple MacBook' returns accessories before the actual laptop. The query uses a plain 'match' without any field weighting.",
    symptom: "Search quality is poor. The 'description' field (which mentions 'Apple' once) outweighs the 'title' field (which says 'Apple MacBook Pro'). No field boosting is configured. Query latency is also above SLA at 150ms.",
    goal: "Improve search relevance. Reduce average query latency below 100ms and system health above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Switch from 'match' on a single field to 'multi_match' across title, description, and brand. Boost the 'title' field with a ^ multiplier (e.g., title^3) so exact title matches score higher.",
        relatedConcept: 'field-boosting',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Use multi_match with type 'best_fields' and tie_breaker=0.3. This ensures the best matching field drives the score while other matching fields contribute a fraction. Also set minimum_should_match to improve precision.",
        relatedConcept: 'multi-match',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 1000 },
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
        id: 'search-frontend',
        targetIndex: 'products',
        queryType: 'match',
        requestsPerSec: 200,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.72 } },
    { atTick: 3, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.68 } },
  ],

  victoryConditions: [
    {
      id: 'latency-ok',
      description: 'Average query latency below 100ms',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 100,
    },
    {
      id: 'health-good',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'field-boosting',
      title: 'Field Boosting',
      body: "Field boosts (title^3) multiply the relevance score for matches in that field. Title matches should outweigh description matches for product search. Experiment with boost values — too high creates the opposite problem where any title match beats a perfect description match.",
      showWhenFixed: true,
    },
    {
      concept: 'multi-match',
      title: 'multi_match Query',
      body: "multi_match runs a match query across multiple fields simultaneously. 'best_fields' picks the highest-scoring field (good for title vs description). 'cross_fields' treats all fields as one (good for full name split across first/last). tie_breaker (0-1) controls how much other matching fields contribute.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig'],
}

export default scenario
