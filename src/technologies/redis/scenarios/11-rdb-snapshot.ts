import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-11-rdb-snapshot',
  index: 11,
  title: 'RDB Snapshot Blocking',
  subtitle: 'Medium · Persistence Tuning',
  difficulty: 'medium',
  estimatedMinutes: 20,
  coverConcepts: ['RDB', 'BGSAVE', 'fork', 'copy-on-write', 'latency spike', 'persistence', 'save schedule'],
  briefing: {
    story:
      'Your payment service\'s Redis instance holds 32GB of data. Every hour, Redis automatically runs BGSAVE to create an RDB snapshot. The fork() system call copies the process\'s page table — on a 32GB dataset, this takes 4 seconds during which Redis latency spikes. The payment service SLA is 200ms p99. For 4 seconds every hour, p99 is 8000ms and the SLA is breached.',
    symptom:
      'Latency spikes to 8000ms for exactly 4 seconds every hour at :00. Payment transaction errors spike. The ops team gets paged every hour. The spike correlates perfectly with BGSAVE execution.',
    goal:
      'Tune the BGSAVE schedule to avoid peak payment hours. Reduce the save frequency or disable automatic BGSAVE during business hours. Optionally switch to AOF with everysec for lower-impact persistence. Reduce average latency below 100ms and error rate below 1%.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'RDB BGSAVE uses fork(). On large datasets, fork() copies the page table which can take several seconds — blocking all Redis commands.',
        relatedConcept: 'fork',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'CONFIG SET save "" disables automatic RDB saves. You can then trigger BGSAVE manually during off-peak hours.',
        relatedConcept: 'save schedule',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'AOF with appendfsync everysec syncs the append-only log once per second. The background sync does not block the event loop, giving more consistent latency.',
        relatedConcept: 'RDB',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 32768,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 1000,
      },
    ],
    clients: [
      {
        id: 'client-payment-service',
        targetNode: 'redis-master',
        opsPerSecond: 5000,
        readRatio: 0.6,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 30, type: 'memory-pressure', target: 'redis-master', params: { reason: 'bgsave-fork', durationTicks: 40 } },
  ],
  victoryConditions: [
    {
      id: 'low-latency',
      description: 'Average latency below 100ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 100,
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
      concept: 'RDB',
      title: 'RDB Snapshots and fork()',
      body: 'RDB creates a point-in-time snapshot by forking the process. The parent continues serving requests while the child writes the snapshot. On Linux, fork() uses copy-on-write (COW) for memory pages. The latency spike comes from copying the page table — linear in dataset size. On 32GB, expect 1–5 seconds.',
      showWhenFixed: true,
    },
    {
      concept: 'copy-on-write',
      title: 'Copy-On-Write Memory Pressure',
      body: 'After fork(), modified pages are duplicated. Under heavy write load during BGSAVE, memory usage can spike to 2x. This triggers OS memory pressure and swap, further increasing latency. Either reduce write load during snapshots or switch to AOF.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['set-persistence-mode', 'set-save-schedule', 'set-appendfsync'],
}

export default scenario
