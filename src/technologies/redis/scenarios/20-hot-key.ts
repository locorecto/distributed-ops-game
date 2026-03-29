import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-20-hot-key',
  index: 20,
  title: 'Hot Key Overload',
  subtitle: 'Hard · Hot Key Mitigation',
  difficulty: 'hard',
  estimatedMinutes: 30,
  coverConcepts: ['hot key', 'local cache', 'read replicas', 'key sharding', 'flash sale', 'key distribution'],
  briefing: {
    story:
      'Your platform launched a flash sale. 100,000 concurrent users are all reading the same "sale-config" key every 100ms to check discount percentages and item availability. This one key is receiving 1,000,000 reads/second — all routed to the single master node that owns the key. The master\'s network interface is saturated at 10Gbps. All other operations on the master are starved. The sale is partially broken.',
    symptom:
      'Average latency is spiking to 500ms+ due to master network saturation. The hot key is receiving 1M ops/sec. Other keys on the same master show 100ms latency because the NIC is the bottleneck. Redis CPU is moderate but bandwidth is 100%.',
    goal:
      'Add a local in-process cache (cache the key for 100ms in the application). Distribute reads across replicas. Optionally shard the hot key (sale-config:shard:{0..9}) and randomly select a shard per request. Reduce average latency below 10ms, error rate below 1%, and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'A hot key is a single Redis key receiving disproportionate traffic. Redis Cluster cannot distribute a single key across nodes.',
        relatedConcept: 'hot key',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Add an application-level local cache for the hot key with a 100ms TTL. Reduces Redis reads by 100x for each app instance.',
        relatedConcept: 'local cache',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Key sharding: store the same value under sale-config:0 through sale-config:9. Each request reads a random shard. Distributes load across 10 keys on potentially different nodes.',
        relatedConcept: 'key sharding',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'sentinel',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 4096,
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 5000,
      },
      {
        id: 'redis-replica-1',
        role: 'replica',
        maxMemoryMb: 4096,
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 5000,
      },
      {
        id: 'redis-replica-2',
        role: 'replica',
        maxMemoryMb: 4096,
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 5000,
      },
    ],
    clients: [
      {
        id: 'client-flash-sale-users',
        targetNode: 'redis-master',
        opsPerSecond: 100000,
        readRatio: 0.99,
        keyPattern: 'hot-key',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'hot-key', target: 'redis-master', params: { key: 'sale-config', opsPerSec: 1000000 } },
  ],
  victoryConditions: [
    {
      id: 'low-latency',
      description: 'Average latency below 10ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 10,
    },
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
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
      concept: 'hot key',
      title: 'Hot Key Problem',
      body: 'A hot key is a Redis key that receives a disproportionately high number of requests. It saturates the CPU or network of the single node handling it. Hot keys cannot be solved by adding more cluster nodes — the key still maps to one slot. Solutions: local caching, read replicas, key sharding, or request coalescing.',
      showWhenFixed: true,
    },
    {
      concept: 'key sharding',
      title: 'Key Sharding',
      body: 'Key sharding replicates a hot key\'s value under multiple key names (e.g., config:0 through config:9). Each request reads a random shard. In a cluster, different shards may land on different nodes, distributing the load. Update all shards on write. Use a consistent hashing approach for predictable shard selection.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-local-cache', 'enable-replica-reads', 'enable-key-sharding'],
}

export default scenario
