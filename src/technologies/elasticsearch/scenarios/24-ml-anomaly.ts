import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'ml-anomaly',
  index: 24,
  title: 'The Sleeping Detector',
  subtitle: 'Expert · Machine Learning',
  difficulty: 'expert',
  estimatedMinutes: 30,
  coverConcepts: ['ml-jobs', 'datafeeds', 'index-aliases', 'ml-job-states'],

  briefing: {
    story: "The ML anomaly detection job for detecting network intrusions stopped advancing 3 days ago. The security team didn't notice until an actual intrusion occurred with no alert. Root cause: the datafeed's index pattern 'network-logs-2024.01.*' matched only January's indices — after ILM rolled over to new monthly indices, the datafeed stopped getting new data.",
    symptom: "ML anomaly job is in 'closed' state. Datafeed has 0 records processed in the last 72 hours. The source index pattern is too specific — it doesn't include the new ILM-rolled indices from February onwards.",
    goal: "Fix the datafeed and restart the ML job. System health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Update the datafeed's index pattern to use the write alias 'network-logs' instead of a specific monthly pattern. Aliases always point to the current write index, so the datafeed will follow rollovers automatically.",
        relatedConcept: 'datafeeds',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "After updating the datafeed index pattern, restart the datafeed and open the ML job. Run a manual catch-up: start the datafeed from 72 hours ago to process missed data. Set the ML job's model_snapshot_retention_days high enough to not lose model state during gaps.",
        relatedConcept: 'ml-job-states',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 2000 },
      { id: 'ml-node', roles: ['data'], heapGb: 16, diskGb: 500 },
    ],
    indices: [
      {
        name: 'network-logs-current',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: 'network-logs-ilm',
      },
      {
        name: '.ml-state',
        shards: 1,
        replicas: 0,
        refreshIntervalMs: 1000,
        maxResultWindow: 1000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'network-monitor',
        targetIndex: 'network-logs-current',
        queryType: 'bulk-index',
        requestsPerSec: 2000,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'unassigned-shards', target: '.ml-state', params: { count: 1 } },
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
      concept: 'ml-jobs',
      title: 'ML Anomaly Detection Jobs',
      body: "ML anomaly detection jobs analyze time-series data using unsupervised learning to establish baselines. A job has a 'datafeed' that queries Elasticsearch on a schedule. The job states are: opened (running), closed (stopped), failed (error). A closed job retains its model and can be reopened.",
      showWhenFixed: true,
    },
    {
      concept: 'datafeeds',
      title: 'Datafeed Index Patterns',
      body: "Datafeeds specify which indices to read data from. Use read aliases (not time-stamped patterns) so the datafeed automatically follows ILM rollovers. If using date-math patterns, use a wildcard (network-logs-*) rather than a specific date pattern that expires.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig'],
}

export default scenario
