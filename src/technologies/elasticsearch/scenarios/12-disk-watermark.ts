import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'disk-watermark',
  index: 12,
  title: 'Disk Full, All Indices Read-Only',
  subtitle: 'Medium-Hard · Disk Management',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['disk-watermark', 'flood-stage', 'ilm-rollover', 'read-only-index'],

  briefing: {
    story: "It's 3am. PagerDuty wakes you up: ALL indices are now read-only. The log ingestion pipeline is dropping millions of events per minute. Root cause: disk hit 96% and the flood-stage watermark (95%) triggered, making every index read-only automatically.",
    symptom: "Disk usage is 96% on all data nodes. Flood-stage watermark triggered. All indices have index.blocks.write=true. Indexing pipeline is 100% error rate. Business cannot afford to lose this data.",
    goal: "Recover write capability. Disk pressure below 85% and error rate below 1%.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "First, reduce disk usage: delete old indices you no longer need, force ILM to transition hot indices to warm/cold/delete phases. You can manually trigger ILM transition with POST <index>/_ilm/move_to_step.",
        relatedConcept: 'ilm-rollover',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "After freeing space, you must manually clear the read-only block: PUT <index>/_settings with index.blocks.write=false. Also reduce replicas to 0 temporarily to free more space. Consider reducing retention policies.",
        relatedConcept: 'flood-stage',
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
        name: 'logs-2024.01',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: 'logs-ilm',
      },
      {
        name: 'logs-2024.02',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: 'logs-ilm',
      },
    ],
    clients: [
      {
        id: 'log-shipper',
        targetIndex: 'logs-2024.02',
        queryType: 'bulk-index',
        requestsPerSec: 5000,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'disk-watermark', target: 'node-1', params: { diskPct: 0.96 } },
    { atTick: 1, type: 'disk-watermark', target: 'node-2', params: { diskPct: 0.95 } },
    { atTick: 1, type: 'disk-watermark', target: 'node-3', params: { diskPct: 0.94 } },
  ],

  victoryConditions: [
    {
      id: 'disk-ok',
      description: 'Disk pressure below 85%',
      required: true,
      check: s => s.metrics.diskPressure < 0.85,
    },
    {
      id: 'error-rate-low',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
  ],

  conceptCards: [
    {
      concept: 'disk-watermark',
      title: 'Disk Watermarks',
      body: "Elasticsearch has three disk thresholds: low (85%) = no new shards allocated here; high (90%) = existing shards relocated away; flood_stage (95%) = ALL indices on this node become read-only. flood_stage blocks are not auto-removed — you must manually clear index.blocks.write=false after freeing space.",
      showWhenFixed: true,
    },
    {
      concept: 'ilm-rollover',
      title: 'ILM Rollover and Deletion',
      body: "ILM automates index lifecycle: hot (active writing) → warm (read-heavy) → cold (archived) → delete. Rollover creates a new write index when the current one hits size/age/doc count limits. Always configure delete phases with appropriate retention to prevent disk exhaustion.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig', 'deleteIndex'],
}

export default scenario
