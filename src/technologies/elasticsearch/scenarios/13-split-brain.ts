import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'split-brain',
  index: 13,
  title: 'Two Masters, Zero Trust',
  subtitle: 'Medium-Hard · Split Brain',
  difficulty: 'medium-hard',
  estimatedMinutes: 25,
  coverConcepts: ['split-brain', 'minimum-master-nodes', 'voting-configuration', 'network-partition'],

  briefing: {
    story: "Your 5-node cluster was split by a network partition into 2+3 nodes. The 2-node minority elected its own master. When the network healed, both partitions tried to assert master authority. Now you have two masters, diverged cluster states, and data inconsistency.",
    symptom: "Cluster health RED. Two master nodes competing. Nodes on the minority side have accepted writes that the majority side doesn't know about. Clients are seeing inconsistent data depending on which partition they connect to.",
    goal: "Restore cluster to a single master. Health not RED and system health above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "Split brain prevention requires discovery.zen.minimum_master_nodes = floor(eligible_masters/2) + 1. With 5 master-eligible nodes, set this to 3. A partition of 2 nodes can never get 3 votes, so it won't elect a master.",
        relatedConcept: 'minimum-master-nodes',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "In ES 7+, minimum_master_nodes is replaced by voting configurations. The cluster automatically maintains a voting majority. To fix the current state: identify the authoritative master (the one with more nodes), restart the minority-side master node to force it to join the correct cluster.",
        relatedConcept: 'voting-configuration',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-3', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-4', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-5', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
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
    ],
    clients: [
      {
        id: 'app-client',
        targetIndex: 'transactions',
        queryType: 'match',
        requestsPerSec: 100,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'split-brain', target: 'cluster', params: { minorityCount: 2 } },
  ],

  victoryConditions: [
    {
      id: 'not-red',
      description: 'Cluster health is not RED',
      required: true,
      check: s => s.metrics.clusterHealth !== 'red',
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
      concept: 'split-brain',
      title: 'Split Brain in Distributed Systems',
      body: "Split brain occurs when a network partition causes a cluster to form two independent sub-clusters, each believing it is the true master. Both sub-clusters continue accepting writes, leading to data divergence. After healing, you must choose one version — the other side's writes are lost.",
      showWhenFixed: true,
    },
    {
      concept: 'minimum-master-nodes',
      title: 'Quorum-Based Master Election',
      body: "Set minimum_master_nodes to ⌊N/2⌋+1 where N is master-eligible node count. This ensures only one partition can have quorum and elect a master. Without quorum, a partition refuses to elect a master rather than risk split-brain. In ES 7+, this is managed automatically via voting configurations.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['toggleNode', 'applyNodeConfig'],
}

export default scenario
