import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-17-pipeline-throughput',
  index: 17,
  title: 'Pipeline Throughput Bottleneck',
  subtitle: 'Medium-Hard · Pipelining',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['pipelining', 'round-trip time', 'RTT', 'batch commands', 'throughput', 'network latency'],
  briefing: {
    story:
      'Your reporting service generates daily reports by writing 10,000 aggregated metrics to Redis at the end of each processing run. Each metric is written with an individual SET command. Round-trip time (RTT) to the Redis instance is 1ms. Total time: 10,000 × 1ms = 10 seconds. The report generation SLA is 2 seconds. Reports are consistently failing the SLA, and the reporting job queue is backing up.',
    symptom:
      'Report generation takes 10 seconds instead of 2 seconds. Redis is barely utilized — it is waiting for individual command round trips. Network is the bottleneck, not Redis. Throughput is limited by RTT × number_of_commands.',
    goal:
      'Enable Redis pipelining: batch 500 commands per pipeline flush. Instead of 10,000 round trips, use 20 round trips (10,000 ÷ 500). Total time drops from 10s to ~20ms. Reduce average latency below 200ms and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'Each individual command requires a round trip. With 1ms RTT and 10K commands, you spend 10 seconds just on network wait time.',
        relatedConcept: 'round-trip time',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'Pipelining buffers multiple commands client-side and sends them in one TCP write. The server processes them all and sends responses together. No wait between commands.',
        relatedConcept: 'pipelining',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'Optimal pipeline batch size is 100–1000 commands. Too small: too many round trips. Too large: buffers grow, memory pressure on client and server. 500 is a good default.',
        relatedConcept: 'batch commands',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 1024,
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 500,
      },
    ],
    clients: [
      {
        id: 'client-reporting-service',
        targetNode: 'redis-master',
        opsPerSecond: 1000,
        readRatio: 0.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'memory-pressure', target: 'redis-master', params: { reason: 'single-command-rtt', rttMs: 1 } },
  ],
  victoryConditions: [
    {
      id: 'low-latency',
      description: 'Average latency below 200ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 200,
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
      concept: 'pipelining',
      title: 'Redis Pipelining',
      body: 'Pipelining sends multiple commands without waiting for individual responses. Commands are buffered client-side and flushed as a batch. Redis processes them sequentially and returns all responses in one TCP read. This converts N round trips into 1, dramatically improving throughput for bulk operations.',
      showWhenFixed: true,
    },
    {
      concept: 'RTT',
      title: 'Round-Trip Time (RTT) and Latency',
      body: 'RTT is the time for a command to travel from client to server and back. Even with sub-millisecond Redis processing time, 1ms RTT × 10,000 commands = 10 seconds. RTT dominates when commands are sent one-by-one. Pipelining amortizes RTT across all batched commands.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-pipelining', 'set-pipeline-batch-size'],
}

export default scenario
