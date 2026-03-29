import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'snapshot-restore',
  index: 18,
  title: 'Half-Restored Nightmare',
  subtitle: 'Hard · Snapshot & Restore',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['snapshots', 'snapshot-restore', 'partial-restore', 'repository-config'],

  briefing: {
    story: "An engineer accidentally deleted the 'user-profiles' index in production (DROP TABLE equivalent). They initiated a snapshot restore, but it failed halfway when the S3 bucket ran out of permission. Now the index has 3 out of 5 shards restored but 2 are in a 'missing' unassigned state.",
    symptom: "Cluster is RED. 'user-profiles' has 2 primary shards unassigned. The partial restore left the index in an inconsistent state. The original data is gone. Only the snapshot remains. Attempting to query returns partial results.",
    goal: "Fully restore the index. Zero unassigned shards and cluster not RED.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "You can't resume a failed restore — you must start fresh. First close or delete the partially-restored index. Then fix the S3 permissions issue and retry the restore from the same snapshot.",
        relatedConcept: 'snapshot-restore',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Set 'partial: false' (default) in the restore request to ensure the restore either completes fully or fails entirely — no partial state. Also verify the snapshot is COMPLETE status before restoring with GET /_snapshot/<repo>/<snapshot>.",
        relatedConcept: 'partial-restore',
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
        name: 'user-profiles',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'profiles-service',
        targetIndex: 'user-profiles',
        queryType: 'term',
        requestsPerSec: 500,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'unassigned-shards', target: 'user-profiles', params: { count: 2 } },
  ],

  victoryConditions: [
    {
      id: 'no-unassigned',
      description: 'Zero unassigned shards',
      required: true,
      check: s => s.metrics.unassignedShards === 0,
    },
    {
      id: 'not-red',
      description: 'Cluster health not RED',
      required: true,
      check: s => s.metrics.clusterHealth !== 'red',
    },
  ],

  conceptCards: [
    {
      concept: 'snapshots',
      title: 'Elasticsearch Snapshots',
      body: "Snapshots capture the state of one or more indices at a point in time. They are stored incrementally in a snapshot repository (S3, GCS, Azure Blob, or shared filesystem). A snapshot only includes changes since the previous snapshot. Always verify snapshot status is SUCCESS before relying on it for recovery.",
      showWhenFixed: true,
    },
    {
      concept: 'partial-restore',
      title: 'Partial Restores and Recovery',
      body: "A partial restore (partial: true) allows restoring an index even if some shards are unavailable in the snapshot. The missing shards will be unassigned. Use this only when accepting data loss. For full recovery, set partial: false and ensure the snapshot is complete before restoring.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'toggleNode'],
}

export default scenario
