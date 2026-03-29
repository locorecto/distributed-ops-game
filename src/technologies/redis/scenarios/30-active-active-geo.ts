import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-30-active-active-geo',
  index: 30,
  title: 'Active-Active Geo-Replication',
  subtitle: 'Master · CRDT & Conflict Resolution',
  difficulty: 'master',
  estimatedMinutes: 50,
  coverConcepts: ['CRDT', 'causal consistency', 'active-active', 'conflict resolution', 'geo-replication'],
  briefing: {
    story:
      'Two Redis Enterprise clusters in US-East and EU-West run in active-active mode via CRDTs. A network partition for 8 minutes caused both regions to accept conflicting writes. When the partition healed, counter CRDTs accumulated correctly but last-write-wins registers silently discarded EU writes. 30,000 user preference updates from EU were lost. Now you must audit the conflict resolution strategy, switch critical keys to appropriate CRDT types, and implement causal consistency checks.',
    symptom:
      'System health is 45%. EU-West writes are being silently discarded. 30K user preferences lost. Replication lag is 12 seconds. Write conflicts being resolved by last-write-wins instead of CRDT merge.',
    goal:
      'Implement correct CRDT types for conflicting data (counters→CRDT counter, preferences→CRDT hash). Achieve replication lag < 1s, health > 85%, zero write conflicts lost.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'Last-write-wins (LWW) is the default conflict resolution for string keys in active-active. It silently drops the losing write. Inspect which key types are configured with LWW vs CRDT merge policies.',
        relatedConcept: 'conflict resolution',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Use CRDT counters (INCRBY) for numeric values that must accumulate across regions — they merge by summing deltas. For user preference hashes, switch to CRDT hash so each field is independently merged without overwriting the whole value.',
        relatedConcept: 'CRDT',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Causal consistency requires vector clocks to track which writes happened before others. Enable causal-consistency mode on the active-active database and verify replication lag drops below 1 second after force-sync completes.',
        relatedConcept: 'causal consistency',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'cluster',
    nodes: [
      {
        id: 'redis-us-east-master',
        role: 'master',
        maxMemoryMb: 16384,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 5000,
      },
      {
        id: 'redis-eu-west-master',
        role: 'master',
        maxMemoryMb: 16384,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 5000,
      },
    ],
    clients: [
      {
        id: 'client-us-east-app',
        targetNode: 'redis-us-east-master',
        opsPerSecond: 8000,
        readRatio: 0.6,
        keyPattern: 'random',
        valueSize: 'small',
      },
      {
        id: 'client-eu-west-app',
        targetNode: 'redis-eu-west-master',
        opsPerSecond: 6000,
        readRatio: 0.6,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    {
      atTick: 5,
      type: 'network-partition',
      target: 'redis-eu-west-master',
      params: { reason: 'inter-region-link-failure', durationTicks: 16, affectedKeys: 30000 },
    },
    {
      atTick: 21,
      type: 'replication-conflict',
      target: 'redis-us-east-master',
      params: { reason: 'lww-overwrites-eu-writes', lostUpdates: 30000, lagMs: 12000 },
    },
  ],
  victoryConditions: [
    {
      id: 'healthy-system',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
    {
      id: 'low-replication-lag',
      description: 'Replication lag below 1 second',
      required: true,
      check: s => s.metrics.replicationLag < 1000,
    },
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
  ],
  conceptCards: [
    {
      concept: 'CRDT',
      title: 'Conflict-free Replicated Data Types (CRDTs)',
      body: 'CRDTs are data structures that can be updated independently in multiple replicas and always merged deterministically without conflicts. Redis Enterprise supports CRDT counters (increment-only, merges by summing deltas), CRDT sets (union on merge), and CRDT hashes (per-field last-write-wins or counter fields). Choosing the right CRDT type for each data shape eliminates silent data loss during network partitions.',
      showWhenFixed: true,
    },
    {
      concept: 'causal consistency',
      title: 'Causal Consistency & Vector Clocks',
      body: 'Causal consistency guarantees that if write A causally precedes write B, every replica that has seen B has also seen A. Redis Enterprise active-active databases use vector clocks to track causal dependencies across regions. Enabling causal-consistency mode prevents stale reads where a replica serves data that predates a write the client already observed.',
      showWhenFixed: true,
    },
    {
      concept: 'active-active',
      title: 'Active-Active Geo-Replication',
      body: 'In active-active (multi-master) replication, every region accepts both reads and writes locally with low latency, then asynchronously syncs changes to all other regions. This trades strong consistency for availability and partition tolerance. Conflicts are inevitable during partitions and must be resolved by the chosen CRDT merge policy — not silently dropped by last-write-wins.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['set-crdt-type', 'configure-conflict-resolution', 'force-sync'],
}

export default scenario
