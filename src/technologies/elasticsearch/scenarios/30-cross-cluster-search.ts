import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'es-30-cross-cluster-search',
  index: 30,
  title: 'Cross-Cluster Search Outage',
  subtitle: 'Master · CCS Architecture',
  difficulty: 'master',
  estimatedMinutes: 55,
  coverConcepts: ['cross-cluster-search', 'remote-cluster', 'skip_unavailable', 'cluster-alias', 'minimize-roundtrips'],

  briefing: {
    story: "A unified search product queries 5 remote Elasticsearch clusters across regions using CCS. The EU-GDPR cluster went offline for maintenance, but `skip_unavailable: false` is causing ALL cross-cluster searches to fail — even ones that don't need EU data. 100% of your multi-region search is down because of one unavailable cluster. Additionally, `ccs_minimize_roundtrips: false` is doubling query latency.",
    symptom: "All CCS queries return a `remote_transport_exception` referencing the `eu-gdpr` remote cluster. The coordinating node refuses to continue when any configured remote is unreachable and `skip_unavailable` is false. Query latency on healthy clusters has doubled because `ccs_minimize_roundtrips: false` forces an extra round-trip to collect shard metadata before executing. 100% search error rate across all regions.",
    goal: "Restore multi-region search availability. CCS error rate must drop to zero, average query latency must be below 150ms, and system health must be above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Set `skip_unavailable: true` on the `eu-gdpr` remote cluster configuration. This tells the coordinating node to treat an unreachable remote as an empty shard set rather than a fatal error. Queries that include `eu-gdpr:*` will return partial results from available clusters instead of failing entirely.",
        relatedConcept: 'skip_unavailable',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Enable `ccs_minimize_roundtrips: true` at the request level (or cluster default). With minimize_roundtrips enabled, the coordinating node sends the entire search request to each remote in one step. Without it, a separate round-trip fetches shard information first, then another executes the query — doubling latency across WAN links.",
        relatedConcept: 'minimize-roundtrips',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: "If the EU-GDPR cluster will remain unavailable for an extended period, remove it from the remote cluster configuration entirely to eliminate connection timeout overhead on every CCS request. Re-add it once maintenance is complete and connectivity is verified.",
        relatedConcept: 'remote-cluster',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-3', roles: ['data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-4', roles: ['data'], heapGb: 32, diskGb: 2000 },
    ],
    indices: [
      {
        name: 'unified-search',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'search-gateway',
        targetIndex: 'unified-search',
        queryType: 'match',
        requestsPerSec: 500,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'remote-cluster-down', target: 'eu-gdpr', params: { recoveryTick: 999 } },
    { atTick: 1, type: 'query-failure', target: 'search-gateway', params: { errorRate: 1.0 } },
  ],

  victoryConditions: [
    {
      id: 'no-ccs-errors',
      description: 'CCS error rate drops to zero',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 150,
    },
    {
      id: 'latency-ok',
      description: 'Average query latency below 150ms',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 150,
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
      concept: 'skip_unavailable',
      title: 'skip_unavailable: Fault Tolerance for CCS',
      body: "When `skip_unavailable: false` (the default), CCS treats an unreachable remote cluster as a fatal error — the entire request fails. Setting `skip_unavailable: true` per remote cluster causes the coordinating node to skip that remote and return results from available clusters only. The response includes a `_clusters` section indicating which remotes were skipped. Always enable this on remotes where partial results are acceptable.",
      showWhenFixed: true,
    },
    {
      concept: 'minimize-roundtrips',
      title: 'ccs_minimize_roundtrips',
      body: "With `ccs_minimize_roundtrips: false`, CCS uses two round-trips per remote: first to fetch shard routing info, then to execute the query. Across high-latency WAN links, this doubles effective query time. With `ccs_minimize_roundtrips: true`, the coordinating node sends the full query in a single request that each remote executes and returns ranked results from. This is the default since Elasticsearch 7.x and should almost always remain enabled.",
      showWhenFixed: false,
    },
    {
      concept: 'remote-cluster',
      title: 'Remote Cluster Lifecycle',
      body: "Remote clusters are registered via `cluster.remote.<alias>.seeds` (sniff mode) or `cluster.remote.<alias>.proxy_address` (proxy mode). Each CCS query pattern `<alias>:<index>` routes to the named remote. Connection timeouts on unavailable remotes add latency to every CCS request even when `skip_unavailable: true` — if a remote is offline long-term, removing it from the configuration eliminates that overhead entirely.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['set-skip-unavailable', 'enable-minimize-roundtrips', 'remove-unavailable-remote'],
}

export default scenario
