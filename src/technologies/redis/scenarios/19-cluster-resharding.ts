import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-19-cluster-resharding',
  index: 19,
  title: 'Cluster Slot Resharding',
  subtitle: 'Hard · Redis Cluster',
  difficulty: 'hard',
  estimatedMinutes: 30,
  coverConcepts: ['Redis Cluster', 'hash slots', 'resharding', 'MOVED', 'ASK', 'cluster-aware client', 'slot migration'],
  briefing: {
    story:
      'Your Redis Cluster is rebalancing: 2,000 hash slots are being migrated from node-1 to node-3. During migration, keys in those slots may be on either node. Redis issues MOVED errors (key is now permanently on another node) and ASK errors (key is temporarily on another node during migration). Your application\'s Redis client is not cluster-aware — it does not follow MOVED or ASK redirects. Every command to a migrating key returns a 500 error to users.',
    symptom:
      'Error rate is 35% during resharding. Application logs are full of MOVED and ASK error responses. The client is treating them as fatal errors instead of redirects. Users are getting 500 errors for any operation touching the 2,000 migrating slots.',
    goal:
      'Update the Redis client to cluster mode, enabling automatic MOVED/ASK redirect following. Optionally pause resharding during peak traffic windows. Reduce error rate below 2% and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'MOVED <slot> <ip:port> means the key has permanently moved to another node. The client must reconnect to that node.',
        relatedConcept: 'MOVED',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'ASK <slot> <ip:port> is temporary during migration. The client must send ASKING to the target node first, then resend the command. It should NOT update its slot cache.',
        relatedConcept: 'ASK',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Use a cluster-aware Redis client library (e.g., ioredis in cluster mode, Jedis ClusterClient). These handle MOVED/ASK automatically and maintain a slot→node routing table.',
        relatedConcept: 'cluster-aware client',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'cluster',
    nodes: [
      {
        id: 'redis-node-1',
        role: 'master',
        maxMemoryMb: 4096,
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
      {
        id: 'redis-node-2',
        role: 'master',
        maxMemoryMb: 4096,
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
      {
        id: 'redis-node-3',
        role: 'master',
        maxMemoryMb: 4096,
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
    ],
    clients: [
      {
        id: 'client-app',
        targetNode: 'redis-node-1',
        opsPerSecond: 8000,
        readRatio: 0.7,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 10, type: 'replication-lag', target: 'redis-node-1', params: { reason: 'slot-migration', slotsMoving: 2000 } },
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
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],
  conceptCards: [
    {
      concept: 'hash slots',
      title: 'Redis Cluster Hash Slots',
      body: 'Redis Cluster divides the keyspace into 16,384 hash slots. Each key is assigned a slot via CRC16(key) mod 16384. Each master node owns a range of slots. Resharding moves slot ownership between nodes. Keys in migrating slots may respond with ASK (temporary) or MOVED (permanent) redirects.',
      showWhenFixed: true,
    },
    {
      concept: 'cluster-aware client',
      title: 'Cluster-Aware Redis Clients',
      body: 'A cluster-aware client maintains a local slot→node mapping. On MOVED, it updates its map and retries. On ASK, it sends ASKING then retries (without updating its map). Most modern Redis clients support cluster mode: ioredis, redis-py-cluster, Jedis, StackExchange.Redis, etc.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-cluster-mode-client', 'pause-resharding', 'update-slot-mapping'],
}

export default scenario
