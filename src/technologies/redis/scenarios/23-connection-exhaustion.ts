import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-23-connection-exhaustion',
  index: 23,
  title: 'Connection Pool Exhaustion',
  subtitle: 'Hard · Connection Management',
  difficulty: 'hard',
  estimatedMinutes: 28,
  coverConcepts: ['connection pool', 'maxclients', 'connection multiplexing', 'TCP connections', 'connection leak'],
  briefing: {
    story:
      'Your microservices architecture has 50 app instances, each configured with a Redis connection pool of max-connections=5000. Total connections = 50 × 5000 = 250,000. Redis maxclients is configured at 10,000. New connections beyond 10,000 are rejected with "ERR max number of clients reached." As app instances scale up, the connection rejection rate grows. Requests are failing because they cannot get a Redis connection. A 51st app instance cannot connect at all.',
    symptom:
      'Connected clients: 250,000 attempted vs 10,000 maximum. New connection attempts are rejected. Error rate is growing with each new app instance. The system is in a positive feedback loop: more errors → more retries → more connections → more rejections.',
    goal:
      'Reduce per-instance pool size from 5000 to 100 connections (50 instances × 100 = 5,000 total, well under 10,000). Use connection multiplexing or a Redis proxy (like Twemproxy/Envoy) to share connections. Reduce error rate below 2% and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: '50 instances × 5000 connections = 250,000 total, far exceeding Redis maxclients=10,000. Each instance has 4,995 idle connections doing nothing.',
        relatedConcept: 'connection pool',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Reduce pool size to 100 per instance: 50 × 100 = 5,000 total. Keep at least 20% headroom below maxclients for monitoring, CLI tools, and replica connections.',
        relatedConcept: 'maxclients',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Consider a Redis proxy like Envoy or Twemproxy. Proxies maintain a small pool to Redis and multiplex thousands of client connections onto it. Reduces Redis connection count to pool_size × proxy_instances.',
        relatedConcept: 'connection multiplexing',
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
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 10000,
      },
    ],
    clients: [
      {
        id: 'client-microservice-pool',
        targetNode: 'redis-master',
        opsPerSecond: 20000,
        readRatio: 0.7,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'connection-storm', target: 'redis-master', params: { totalConnections: 250000, maxClients: 10000 } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
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
      concept: 'connection pool',
      title: 'Connection Pool Sizing',
      body: 'Each Redis connection uses ~20KB of memory and a file descriptor. The optimal pool size per instance is: (avg_ops_per_sec × avg_latency_ms) / 1000. For 1000 ops/sec at 1ms latency: 1 connection is sufficient. Over-provisioning wastes resources and can exceed Redis maxclients.',
      showWhenFixed: true,
    },
    {
      concept: 'connection multiplexing',
      title: 'Connection Multiplexing',
      body: 'A Redis proxy (Twemproxy, Envoy, KeyDB Proxy) accepts thousands of client connections and multiplexes them onto a small pool of connections to Redis. This decouples client connection count from Redis connection count. Essential for large microservice deployments.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['reduce-pool-size', 'add-redis-proxy', 'increase-maxclients'],
}

export default scenario
