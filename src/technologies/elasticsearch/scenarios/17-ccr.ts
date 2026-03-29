import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'ccr',
  index: 17,
  title: 'Stale Follower',
  subtitle: 'Hard · Cross-Cluster Replication',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['ccr', 'follower-index', 'replication-lag', 'heap-sizing'],

  briefing: {
    story: "Your DR setup uses Cross-Cluster Replication (CCR) to keep a follower cluster in sync with the leader. The SLA requires the follower to be within 60 seconds of the leader. Monitoring shows the follower is 15 minutes behind and falling further back. The DR failover test failed.",
    symptom: "CCR follower lag is 15 minutes and growing. Root cause: the follower node has only 4GB heap and the leader is writing 500MB/min. max_read_request_size defaults to 32MB — with 4GB heap, the follower GC-pauses frequently and can't keep up.",
    goal: "Reduce follower lag. System health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The follower's heap is too small to handle the replication throughput. Increase the follower node's heap. CCR uses heap for the replication buffer — aim for at least 50% of the expected bytes-per-second lag × 60 seconds.",
        relatedConcept: 'heap-sizing',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Also tune CCR settings: reduce max_read_request_size to 16MB to avoid heap spikes during large reads. Increase max_outstanding_read_requests to 3 for pipelining. Monitor with GET /<follower-index>/_ccr/stats.",
        relatedConcept: 'ccr',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'leader-node-1', roles: ['master', 'data'], heapGb: 32, diskGb: 2000 },
      { id: 'follower-node-1', roles: ['master', 'data'], heapGb: 4, diskGb: 2000 },
    ],
    indices: [
      {
        name: 'orders-leader',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
      {
        name: 'orders-follower',
        shards: 5,
        replicas: 0,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'orders-writer',
        targetIndex: 'orders-leader',
        queryType: 'bulk-index',
        requestsPerSec: 500,
      },
      {
        id: 'dr-reader',
        targetIndex: 'orders-follower',
        queryType: 'match',
        requestsPerSec: 50,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'heap-pressure', target: 'follower-node-1', params: { heapPct: 0.88 } },
    { atTick: 5, type: 'circuit-breaker', target: 'cluster', params: {} },
  ],

  victoryConditions: [
    {
      id: 'health-good',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'ccr',
      title: 'Cross-Cluster Replication',
      body: "CCR replicates indices from a leader cluster to follower clusters asynchronously. The follower polls the leader for new operations and replays them. Lag is determined by follower throughput capacity. Under-provisioned follower nodes cannot keep up with high-write leaders.",
      showWhenFixed: true,
    },
    {
      concept: 'replication-lag',
      title: 'Minimizing CCR Lag',
      body: "CCR lag is primarily bounded by follower throughput. Key tuning: heap (must handle replication buffer), max_read_request_size (match to write batch size), max_outstanding_read_requests (parallelism). Monitor with /_ccr/stats and alert when lag exceeds your RPO target.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyNodeConfig', 'toggleNode'],
}

export default scenario
