import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'ilm-policy',
  index: 16,
  title: 'ILM Never Runs',
  subtitle: 'Medium-Hard · ILM Policy',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['ilm', 'ilm-phases', 'index-patterns', 'ilm-explain'],

  briefing: {
    story: "The platform team set up an ILM policy 6 months ago to delete logs older than 30 days. But the disk keeps filling up. On investigation, the ILM policy's index_patterns is 'application-logs-*' but actual indices are named 'app-logs-*'. The policy never matched a single index.",
    symptom: "Disk usage grows 2GB/day. ILM policy exists but has 0 managed indices. Old log indices from 6 months ago still exist and are consuming 360GB. At this rate, disk will be full in 5 days.",
    goal: "Fix ILM configuration. Disk pressure below 70% and system health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Run GET _ilm/policy/<policy_name> to inspect the policy, then GET app-logs-*/_ilm/explain to see why ILM isn't managing these indices. The index_patterns mismatch is the root cause.",
        relatedConcept: 'ilm-explain',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Update the ILM policy's index_patterns to match 'app-logs-*'. Then manually trigger the transition for existing old indices: POST app-logs-2024.01*/_ilm/move_to_step with the delete phase step.",
        relatedConcept: 'ilm-phases',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-3', roles: ['data'], heapGb: 16, diskGb: 1000 },
    ],
    indices: [
      {
        name: 'app-logs-current',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'log-ingester',
        targetIndex: 'app-logs-current',
        queryType: 'bulk-index',
        requestsPerSec: 2000,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'disk-watermark', target: 'node-1', params: { diskPct: 0.78 } },
    { atTick: 1, type: 'disk-watermark', target: 'node-2', params: { diskPct: 0.75 } },
    { atTick: 1, type: 'disk-watermark', target: 'node-3', params: { diskPct: 0.73 } },
    { atTick: 15, type: 'disk-watermark', target: 'node-1', params: { diskPct: 0.88 } },
  ],

  victoryConditions: [
    {
      id: 'disk-ok',
      description: 'Disk pressure below 70%',
      required: true,
      check: s => s.metrics.diskPressure < 0.7,
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
      concept: 'ilm',
      title: 'Index Lifecycle Management',
      body: "ILM automatically manages index transitions through phases: hot (active indexing), warm (read-only, optimized), cold (infrequent access, compressed), frozen (searchable snapshots), delete. ILM applies to indices that match the policy's index_patterns — always verify the pattern matches real index names.",
      showWhenFixed: true,
    },
    {
      concept: 'ilm-explain',
      title: 'Debugging ILM with _explain',
      body: "GET <index>/_ilm/explain shows the current ILM state for each index: which phase/action/step it's in, why it hasn't transitioned, and any errors. This is the first tool to reach for when ILM isn't working as expected.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'deleteIndex', 'applyNodeConfig'],
}

export default scenario
