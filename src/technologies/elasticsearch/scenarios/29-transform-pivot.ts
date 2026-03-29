import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'es-29-transform-pivot',
  index: 29,
  title: 'Stale Analytics Transform',
  subtitle: 'Expert · Transform API',
  difficulty: 'expert',
  estimatedMinutes: 45,
  coverConcepts: ['transforms', 'pivot-aggregation', 'continuous-transform', 'checkpoint', 'sync-field'],

  briefing: {
    story: "A business analytics dashboard uses a continuous transform to pivot raw transaction data into daily revenue summaries. After a 6-hour cluster maintenance window, the transform stopped checkpointing. It's now 8 hours behind. The sync field wasn't configured correctly — it's using `_ingest.timestamp` instead of `transaction_date`. Finance is seeing yesterday's revenue as today's numbers.",
    symptom: "The continuous transform `daily-revenue-transform` last checkpointed 8 hours ago. Its sync field is set to `_ingest.timestamp`, which is not present on documents re-indexed during maintenance. The pivot destination index `revenue-summary` is serving stale data to the finance dashboard. Transform state shows `indexing` but checkpoint progress is frozen at 0%.",
    goal: "Fix the transform sync field, reset the checkpoint to resume from the correct position, and get the transform current within the last 5 minutes. System health must be above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Stop the transform before making changes. Inspect its configuration — the `sync.time.field` is set to `_ingest.timestamp` but this metadata field isn't reliably propagated after reindex. Change it to `transaction_date`, which is the actual event timestamp present on all documents.",
        relatedConcept: 'sync-field',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "After fixing the sync field, use the Reset Transform API to clear the stale checkpoint state. Then start the transform again. It will re-process from the beginning of the sync window and quickly catch up. Monitor the `pages_processed` and `trigger_count` statistics to confirm progress.",
        relatedConcept: 'checkpoint',
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
        name: 'transactions',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
      {
        name: 'revenue-summary',
        shards: 1,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'finance-dashboard',
        targetIndex: 'revenue-summary',
        queryType: 'match',
        requestsPerSec: 50,
      },
      {
        id: 'transaction-ingest',
        targetIndex: 'transactions',
        queryType: 'bulk-index',
        requestsPerSec: 500,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'transform-stall', target: 'daily-revenue-transform', params: { lagMinutes: 480 } },
  ],

  victoryConditions: [
    {
      id: 'transform-current',
      description: 'Transform is within 5 minutes of real time',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 300,
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
      concept: 'sync-field',
      title: 'Continuous Transform Sync Field',
      body: "A continuous transform uses a `sync.time.field` to detect new or changed source documents. It queries for documents where this field is greater than the last checkpoint timestamp. The field must exist on every source document and must be monotonically increasing. Using `_ingest.timestamp` is unreliable — documents re-indexed or updated lose the original ingest time. Always use a business-level timestamp like `transaction_date` or `event_time`.",
      showWhenFixed: true,
    },
    {
      concept: 'checkpoint',
      title: 'Transform Checkpoints and Reset',
      body: "A continuous transform tracks progress via checkpoints — each checkpoint records the highest sync field value processed. If the checkpoint becomes stale (e.g., sync field changed, source data backfilled), use `POST _transform/<id>/_reset` to clear it. After reset, the transform re-processes from the start of the sync delay window. Use `GET _transform/<id>/_stats` to monitor `pages_processed` and confirm the transform is advancing.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['fix-sync-field', 'reset-transform-checkpoint', 'force-transform-run'],
}

export default scenario
