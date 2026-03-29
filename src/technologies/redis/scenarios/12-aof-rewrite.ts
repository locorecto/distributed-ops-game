import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-12-aof-rewrite',
  index: 12,
  title: 'AOF Rewrite Overhead',
  subtitle: 'Medium · Persistence Tuning',
  difficulty: 'medium',
  estimatedMinutes: 20,
  coverConcepts: ['AOF', 'appendfsync', 'fsync', 'AOF rewrite', 'BGREWRITEAOF', 'write amplification'],
  briefing: {
    story:
      'Your Redis instance uses AOF persistence with appendfsync=always. Every write command is fsynced to disk before Redis acknowledges it. At 100,000 writes/second, this creates 100K fsync calls per second — each taking ~2ms on your SSD. Throughput is capped at 500 ops/sec and latency is a constant 2ms baseline. The AOF file has grown to 200GB. BGREWRITEAOF has never been configured.',
    symptom:
      'Throughput is stuck at 500 ops/sec despite Redis being configured for 100K ops/sec. Every write command has 2ms latency from fsync. The AOF file is 200GB and growing, consuming disk IOPS.',
    goal:
      'Change appendfsync to "everysec" — Redis buffers writes and fsyncs once per second. Enable auto-AOF-rewrite to compact the file. Reduce average latency below 0.5ms and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'appendfsync=always calls fsync() on every write. At 100K writes/sec this is 100K fsync calls/sec — saturating disk IOPS.',
        relatedConcept: 'fsync',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'appendfsync=everysec buffers writes in memory and fsyncs once per second. You can lose up to 1 second of data on crash, but throughput increases 100x.',
        relatedConcept: 'appendfsync',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'Configure auto-aof-rewrite-percentage 100 and auto-aof-rewrite-min-size 64mb. Redis will run BGREWRITEAOF automatically when the AOF grows to 2x its last rewrite size.',
        relatedConcept: 'AOF rewrite',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 4096,
        evictionPolicy: 'noeviction',
        persistenceMode: 'aof',
        appendfsync: 'always',
        maxClients: 1000,
      },
    ],
    clients: [
      {
        id: 'client-write-heavy',
        targetNode: 'redis-master',
        opsPerSecond: 100000,
        readRatio: 0.1,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'memory-pressure', target: 'redis-master', params: { reason: 'aof-fsync-bottleneck' } },
  ],
  victoryConditions: [
    {
      id: 'low-latency',
      description: 'Average latency below 0.5ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 0.5,
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
      concept: 'AOF',
      title: 'Append-Only File (AOF)',
      body: 'AOF logs every write command to disk. On restart, Redis replays the AOF to rebuild the dataset. Three fsync modes: always (sync every write, safest, slowest), everysec (sync every second, 1s data loss risk, fast), no (let OS decide, fastest, most data loss risk).',
      showWhenFixed: true,
    },
    {
      concept: 'AOF rewrite',
      title: 'AOF Rewrite (BGREWRITEAOF)',
      body: 'AOF grows without bound unless rewritten. BGREWRITEAOF creates a new compact AOF containing only the minimum commands to rebuild the current state (e.g., one SET instead of 1000 INCR commands). Configure auto-rewrite thresholds to keep AOF size manageable.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['set-appendfsync', 'enable-aof-rewrite', 'set-persistence-mode'],
}

export default scenario
