import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'async-search',
  index: 26,
  title: 'The 2-Hour Query',
  subtitle: 'Expert · Async Search',
  difficulty: 'expert',
  estimatedMinutes: 30,
  coverConcepts: ['async-search', 'long-running-queries', 'keep-alive', 'search-cancellation'],

  briefing: {
    story: "The data science team runs weekly aggregation queries across 2 years of event data (200GB per year). These queries take 45-90 minutes. The analysts run them from a Jupyter notebook with a 30-second HTTP timeout. The queries fail every time, wasting 30 minutes of compute.",
    symptom: "All long-running analytical queries fail with a timeout error. The HTTP connection drops after 30 seconds but the query continues running server-side, consuming resources. Error rate for the analytics client is 100%. Heap is consumed by in-flight aggregation state.",
    goal: "Enable async queries to complete without timeouts. Error rate below 1% and system health above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Use the async search API: POST /index/_async/search. It returns immediately with an async_id. The query runs in the background. Set keep_alive=2h so results are retained. Poll GET /_async_search/<id> until is_running=false.",
        relatedConcept: 'async-search',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Set wait_for_completion_timeout=5s to get partial results immediately if the query finishes quickly, otherwise fall back to async polling. Use DELETE /_async_search/<id> to cancel abandoned queries and free heap. Always cancel queries you no longer need.",
        relatedConcept: 'search-cancellation',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data', 'coordinating'], heapGb: 32, diskGb: 4000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 4000 },
      { id: 'node-3', roles: ['data'], heapGb: 32, diskGb: 4000 },
    ],
    indices: [
      {
        name: 'events-archive',
        shards: 10,
        replicas: 1,
        refreshIntervalMs: 60000,
        maxResultWindow: 10000,
        ilmPolicy: 'events-ilm',
      },
    ],
    clients: [
      {
        id: 'data-science-notebook',
        targetIndex: 'events-archive',
        queryType: 'aggregation',
        requestsPerSec: 5,
      },
    ],
  },

  failureScript: [
    { atTick: 2, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.82 } },
    { atTick: 2, type: 'query-flood', target: 'cluster', params: {} },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
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
      concept: 'async-search',
      title: 'Async Search API',
      body: "The async search API decouples query submission from result retrieval. Submit a query, get back an ID immediately. The query runs in the background and results are stored in a hidden index. Poll the ID for completion status and retrieve results when ready. Set keep_alive to control how long results are retained.",
      showWhenFixed: true,
    },
    {
      concept: 'long-running-queries',
      title: 'Managing Long-Running Queries',
      body: "Long queries consume coordinating node heap for the duration of execution. If a client disconnects, the query may continue running and wasting resources. Use task cancellation (DELETE /_tasks/<id>) or async search cancellation to stop orphaned queries. Monitor with GET /_tasks?actions=*search*.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyNodeConfig', 'applyIndexConfig'],
}

export default scenario
