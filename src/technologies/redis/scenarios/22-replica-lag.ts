import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-22-replica-lag',
  index: 22,
  title: 'Replica Lag Under Write Load',
  subtitle: 'Hard · Replication',
  difficulty: 'hard',
  estimatedMinutes: 30,
  coverConcepts: ['replication lag', 'repl-backlog-size', 'replica-lazy-flush', 'async replication', 'stale reads', 'read-your-writes'],
  briefing: {
    story:
      'Your financial platform routes read queries to a Redis replica to reduce master load. During month-end batch processing, write throughput spikes to 100K ops/sec. The replication backlog (repl-backlog-size=1MB) fills up and overflows — the replica falls behind by 5 seconds. Applications reading from the replica are seeing account balances from 5 seconds ago. Financial calculations based on stale data are producing incorrect results. A regulatory audit flag has been raised.',
    symptom:
      'Replication lag is 5000ms. Applications reading from the replica are serving 5-second-old data. Balance checks after transfers show incorrect values. The repl-backlog-size overflow is causing replica full resync attempts, adding more lag.',
    goal:
      'Increase repl-backlog-size from 1MB to 256MB to buffer write spikes. Enable replica-lazy-flush to reduce replica flush latency. For financial operations, temporarily route reads to the master (read-your-writes consistency). Reduce replication lag below 100ms and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'repl-backlog-size is the ring buffer holding commands sent to replicas. If the replica falls behind faster than the buffer fills, a full resync is required — adding minutes of lag.',
        relatedConcept: 'repl-backlog-size',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Increase repl-backlog-size to 256mb with CONFIG SET repl-backlog-size 268435456. This accommodates burst writes without forcing resync.',
        relatedConcept: 'replication lag',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'For read-your-writes consistency: after a write, read from the master for that session. Or use WAIT N TIMEOUT to block until N replicas acknowledge the write.',
        relatedConcept: 'stale reads',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'sentinel',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 8192,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
      {
        id: 'redis-replica-1',
        role: 'replica',
        maxMemoryMb: 8192,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
    ],
    clients: [
      {
        id: 'client-write-batch',
        targetNode: 'redis-master',
        opsPerSecond: 100000,
        readRatio: 0.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
      {
        id: 'client-financial-reads',
        targetNode: 'redis-replica-1',
        opsPerSecond: 10000,
        readRatio: 1.0,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 10, type: 'replication-lag', target: 'redis-replica-1', params: { lagMs: 5000, reason: 'backlog-overflow' } },
  ],
  victoryConditions: [
    {
      id: 'low-replication-lag',
      description: 'Replication lag below 100ms',
      required: true,
      check: s => s.metrics.replicationLag < 100,
    },
    {
      id: 'healthy-system',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],
  conceptCards: [
    {
      concept: 'replication lag',
      title: 'Redis Replication Lag',
      body: 'Redis replication is asynchronous by default. The master sends write commands to replicas via the replication backlog. If a replica is slow or the network is congested, lag grows. If lag exceeds the backlog size, the replica must do a full resync (FULLRESYNC), which takes minutes for large datasets.',
      showWhenFixed: true,
    },
    {
      concept: 'repl-backlog-size',
      title: 'Replication Backlog',
      body: 'repl-backlog-size is a circular buffer (default 1MB) that holds recent write commands. If a replica disconnects and reconnects, it can resume from the backlog (partial resync) instead of reloading the full dataset. For high-write workloads, increase to 256MB or more to avoid frequent full resyncs.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['increase-repl-backlog', 'enable-lazy-flush', 'route-reads-to-master'],
}

export default scenario
