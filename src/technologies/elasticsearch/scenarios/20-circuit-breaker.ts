import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'circuit-breaker',
  index: 20,
  title: '503: Circuit Breaker Open',
  subtitle: 'Hard · Circuit Breakers',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['circuit-breakers', 'request-breaker', 'fielddata-breaker', 'in-flight-requests'],

  briefing: {
    story: "The analytics team's dashboards are down — 100% 503 errors. Every request hits the circuit breaker. Root cause: large aggregation queries from the BI tool are each requesting 500MB of memory. With 50 concurrent requests, the request circuit breaker trips and rejects all subsequent requests.",
    symptom: "CircuitBreakerException: [request] Data too large. Error rate is 95%+. The request circuit breaker limit is set too low for the aggregation queries being run. Even simple health checks are rejected once the breaker trips.",
    goal: "Restore normal operations. Error rate below 2% and system health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "The request circuit breaker (indices.breaker.request.limit) defaults to 60% of heap. Large aggregations consume hundreds of MB each. Either increase the limit to 75% or — better — reduce the aggregation cardinality/size to consume less memory.",
        relatedConcept: 'request-breaker',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "The real fix is making aggregations cheaper: use sampler agg to cap input, use composite agg with pagination instead of single large terms agg, add execution_hint: 'map' for very high cardinality. Raising the circuit breaker limit without fixing the query is just moving the OOM.",
        relatedConcept: 'circuit-breakers',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data', 'coordinating'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-3', roles: ['data'], heapGb: 16, diskGb: 1000 },
    ],
    indices: [
      {
        name: 'analytics-events',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: 'analytics-ilm',
      },
    ],
    clients: [
      {
        id: 'bi-dashboard',
        targetIndex: 'analytics-events',
        queryType: 'aggregation',
        requestsPerSec: 50,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'circuit-breaker', target: 'cluster', params: {} },
    { atTick: 1, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.87 } },
    { atTick: 1, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.84 } },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
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
      concept: 'circuit-breakers',
      title: 'Elasticsearch Circuit Breakers',
      body: "Circuit breakers protect nodes from OOM by estimating memory usage before execution. Key breakers: fielddata (heap for field data), request (heap for aggregations/search), in-flight-requests (transport layer). When a breaker trips, ALL requests are rejected with 429 until heap recovers.",
      showWhenFixed: true,
    },
    {
      concept: 'request-breaker',
      title: 'Request Circuit Breaker',
      body: "The request circuit breaker estimates memory needed for a search/aggregation request. Default: 60% of heap. Once the estimated usage exceeds the limit, the request is rejected with EsCircuitBreakerException. Increasing the limit provides more headroom but risks OOM if estimates are wrong.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyNodeConfig', 'applyIndexConfig'],
}

export default scenario
