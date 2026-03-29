import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'reindex-performance',
  index: 11,
  title: 'The 8-Hour Reindex',
  subtitle: 'Medium-Hard · Reindexing',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['reindex', 'sliced-scroll', 'reindex-performance', 'batch-size'],

  briefing: {
    story: "The team needs to reindex 500 million documents to add a new field and change the shard count. Their single-threaded reindex job has been running for 3 hours and the progress bar shows 37% complete — extrapolating to 8 total hours. The SLA is 1 hour of downtime.",
    symptom: "Reindex is single-threaded, processing ~17M docs/hour. Target is 500M docs in 60 minutes (500M/hr throughput). Current batch size is 1000 docs. The source index has only 1 shard being used for the scroll.",
    goal: "Simulate the optimized reindex completing (system health above 80).",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Use sliced scroll to parallelize the reindex across multiple slices. With 5 slices and 3 workers, each slice reads ~100M docs independently. Set 'slices: 5' in the reindex API body.",
        relatedConcept: 'sliced-scroll',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Increase batch size from 1000 to 5000-10000 docs to reduce round-trip overhead. Also increase 'requests_per_second' throttle or set it to -1 (unlimited) during the maintenance window. Disable refresh during reindex with 'refresh_interval: -1' on the destination index.",
        relatedConcept: 'reindex-performance',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 32, diskGb: 4000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 4000 },
      { id: 'node-3', roles: ['data'], heapGb: 32, diskGb: 4000 },
    ],
    indices: [
      {
        name: 'products-v1',
        shards: 1,
        replicas: 0,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
      {
        name: 'products-v2',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: -1,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'reindex-worker',
        targetIndex: 'products-v2',
        queryType: 'scroll',
        requestsPerSec: 5,
      },
    ],
  },

  failureScript: [
    { atTick: 2, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.65 } },
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
      concept: 'sliced-scroll',
      title: 'Sliced Scroll for Parallel Reindex',
      body: "Sliced scroll divides the source index into N independent slices, each assignable to a separate worker thread. With 5 slices on 5-shard source, each slice reads exactly 1 shard — true parallelism. The Reindex API supports slices natively: set 'slices: 5' or 'slices: auto'.",
      showWhenFixed: true,
    },
    {
      concept: 'reindex-performance',
      title: 'Reindex Optimization Checklist',
      body: "1) Set refresh_interval=-1 on destination during reindex. 2) Set number_of_replicas=0 during reindex. 3) Use slices=auto for parallel processing. 4) Increase bulk batch size to 5000-10000. 5) Re-enable replicas and trigger forcemerge after completion.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'reindex', 'applyNodeConfig'],
}

export default scenario
