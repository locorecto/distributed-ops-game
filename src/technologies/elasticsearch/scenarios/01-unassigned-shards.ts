import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'unassigned-shards',
  index: 1,
  title: 'Yellow Cluster Blues',
  subtitle: 'Beginner · Shard Allocation',
  difficulty: 'beginner',
  estimatedMinutes: 5,
  coverConcepts: ['shards', 'replicas', 'cluster-health', 'shard-allocation'],

  briefing: {
    story: "You just deployed a fresh Elasticsearch cluster for the e-commerce team. The cluster is showing yellow and the ops dashboard is screaming. Your manager wants it green before the morning stand-up.",
    symptom: "Cluster health is YELLOW. There are unassigned replica shards on every index. The orders-index has 2 replicas configured but only 1 data node exists.",
    goal: "Get cluster health to GREEN with zero unassigned shards.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "Check the replica count on your index. With only 1 data node, Elasticsearch cannot place replica shards — there's nowhere to put them that isn't the same node as the primary.",
        relatedConcept: 'replicas',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "You have two options: reduce replicas to 0 (not recommended for production) or add a second data node so replicas have somewhere to go. For a real fix, add the node.",
        relatedConcept: 'shard-allocation',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 8, diskGb: 500 },
    ],
    indices: [
      {
        name: 'orders-index',
        shards: 3,
        replicas: 2,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'orders-app',
        targetIndex: 'orders-index',
        queryType: 'bulk-index',
        requestsPerSec: 50,
      },
    ],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'no-unassigned',
      description: 'Zero unassigned shards',
      required: true,
      check: s => s.metrics.unassignedShards === 0,
    },
    {
      id: 'cluster-green',
      description: 'Cluster health is GREEN',
      required: true,
      check: s => s.metrics.clusterHealth === 'green',
    },
  ],

  conceptCards: [
    {
      concept: 'replicas',
      title: 'Replica Shards',
      body: "A replica is a copy of a primary shard. Elasticsearch never places a replica on the same node as its primary. With only 1 data node, any replica count > 0 will result in unassigned shards and a yellow cluster.",
      showWhenFixed: true,
    },
    {
      concept: 'cluster-health',
      title: 'Cluster Health',
      body: "GREEN = all shards assigned. YELLOW = all primaries assigned but some replicas are unassigned. RED = one or more primary shards are unassigned — some data is unavailable. A yellow cluster is still functional but has no redundancy.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'addNode'],
}

export default scenario
