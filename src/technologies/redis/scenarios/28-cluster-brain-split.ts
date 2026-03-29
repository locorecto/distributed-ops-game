import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-28-cluster-brain-split',
  index: 28,
  title: 'Cluster Brain-Split',
  subtitle: 'Expert · Network Partitions',
  difficulty: 'expert',
  estimatedMinutes: 45,
  coverConcepts: ['brain-split', 'network partition', 'cluster-require-full-coverage', 'cluster-node-timeout', 'split-brain', 'data divergence', 'CAP theorem'],
  briefing: {
    story:
      'Your Redis Cluster has 6 nodes across 2 data centers: DC1 (3 masters) and DC2 (3 masters). A network partition separates DC1 and DC2 for 10 minutes. cluster-require-full-coverage=no means both partitions continue accepting writes. DC1 processes 500,000 writes. DC2 processes 200,000 conflicting writes to the same keys. When the partition heals, Redis Cluster uses last-write-wins which discards 200,000 writes. Account balances, inventory counts, and user states are corrupted.',
    symptom:
      'After partition healed: data divergence between nodes. 200,000 writes from the minority partition were discarded. Financial data is corrupted. Inventory oversold. Users are missing transactions. The system healed but data is in an inconsistent state.',
    goal:
      'Set cluster-require-full-coverage=yes so the minority partition stops accepting writes during a partition. Increase cluster-node-timeout from 15s to 30s to reduce false positives. Implement application-level idempotency keys so lost writes can be detected and replayed. Reduce error rate below 1% and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'cluster-require-full-coverage=no allows a cluster partition to continue serving. Both sides accept writes independently — this is the brain-split condition.',
        relatedConcept: 'brain-split',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'cluster-require-full-coverage=yes stops the minority partition from accepting writes when it cannot see all hash slots. Use this when consistency > availability.',
        relatedConcept: 'cluster-require-full-coverage',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Redis Cluster uses last-write-wins for conflicting keys — there is no CRDT merge. For financial data, use idempotency keys: include a client-generated UUID with each write. On replay, duplicate UUIDs are rejected.',
        relatedConcept: 'data divergence',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'cluster',
    nodes: [
      {
        id: 'redis-dc1-master-1',
        role: 'master',
        maxMemoryMb: 8192,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
      {
        id: 'redis-dc1-master-2',
        role: 'master',
        maxMemoryMb: 8192,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
      {
        id: 'redis-dc1-master-3',
        role: 'master',
        maxMemoryMb: 8192,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
      {
        id: 'redis-dc2-master-1',
        role: 'master',
        maxMemoryMb: 8192,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
      {
        id: 'redis-dc2-master-2',
        role: 'master',
        maxMemoryMb: 8192,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
      {
        id: 'redis-dc2-master-3',
        role: 'master',
        maxMemoryMb: 8192,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
    ],
    clients: [
      {
        id: 'client-dc1-app',
        targetNode: 'redis-dc1-master-1',
        opsPerSecond: 10000,
        readRatio: 0.4,
        keyPattern: 'random',
        valueSize: 'small',
      },
      {
        id: 'client-dc2-app',
        targetNode: 'redis-dc2-master-1',
        opsPerSecond: 5000,
        readRatio: 0.4,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 10, type: 'replication-lag', target: 'redis-dc2-master-1', params: { reason: 'network-partition', partitionMs: 600000 } },
    { atTick: 10, type: 'replication-lag', target: 'redis-dc2-master-2', params: { reason: 'network-partition' } },
    { atTick: 10, type: 'replication-lag', target: 'redis-dc2-master-3', params: { reason: 'network-partition' } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'healthy-system',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],
  conceptCards: [
    {
      concept: 'brain-split',
      title: 'Brain-Split in Distributed Systems',
      body: 'Brain-split occurs when a network partition causes two groups of nodes to believe they are the authoritative cluster. Both partitions accept writes independently. When the partition heals, conflicting writes must be reconciled. Without CRDT semantics, one side\'s writes are discarded. This is the CP vs AP tradeoff from the CAP theorem.',
      showWhenFixed: true,
    },
    {
      concept: 'CAP theorem',
      title: 'CAP Theorem and Redis Cluster',
      body: 'Redis Cluster is an AP system by default (cluster-require-full-coverage=no): available during partitions, eventually consistent. With cluster-require-full-coverage=yes it becomes CP: consistent but unavailable during partitions. Choose based on whether data loss or service unavailability is more acceptable for your use case.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['set-full-coverage-required', 'set-cluster-timeout', 'enable-idempotency-keys'],
}

export default scenario
