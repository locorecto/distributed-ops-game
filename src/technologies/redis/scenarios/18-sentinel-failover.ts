import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-18-sentinel-failover',
  index: 18,
  title: 'Sentinel Failover Misconfiguration',
  subtitle: 'Hard · High Availability',
  difficulty: 'hard',
  estimatedMinutes: 30,
  coverConcepts: ['Sentinel', 'quorum', 'failover', 'split-brain', 'high availability', 'master election'],
  briefing: {
    story:
      'Your Redis HA setup uses 3 Sentinel nodes monitoring 1 master + 2 replicas. Quorum is set to 2 (majority of 3). One Sentinel node crashed last week and was not replaced. This morning the master Redis instance crashed. Only 1 Sentinel is alive — it cannot reach quorum=2 to authorize failover. The system has been in a "no master" state for 30 minutes. All writes are failing. Reads from replicas are serving stale data.',
    symptom:
      'Master is down. 1 Sentinel alive, 2 Sentinels dead. Quorum requires 2 agreements to promote a replica. Current state: 1 < 2, no failover possible. All applications that use the Sentinel connection string are in error state.',
    goal:
      'Restore a downed Sentinel or add a 4th Sentinel node to ensure quorum can be reached with 1 node down. Once quorum is met, Sentinel will auto-promote a replica to master. Alternatively, temporarily adjust quorum to 1 and promote the replica manually. Restore system health above 75.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'With 3 Sentinels and quorum=2, you need 2 Sentinels alive to authorize failover. With only 1 alive, no failover can happen.',
        relatedConcept: 'quorum',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Start a replacement Sentinel node. It will discover the master status via SENTINEL MONITOR and participate in quorum.',
        relatedConcept: 'Sentinel',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'For N Sentinels, quorum should be (N/2)+1. With 4 Sentinels: quorum=3 means failover works with 1 Sentinel down. This is the recommended minimum production setup.',
        relatedConcept: 'high availability',
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
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
      {
        id: 'redis-replica-1',
        role: 'replica',
        maxMemoryMb: 4096,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
      {
        id: 'redis-replica-2',
        role: 'replica',
        maxMemoryMb: 4096,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
      {
        id: 'sentinel-1',
        role: 'sentinel',
        maxMemoryMb: 64,
        evictionPolicy: 'noeviction',
        persistenceMode: 'none',
        appendfsync: 'no',
        maxClients: 100,
      },
    ],
    clients: [
      {
        id: 'client-app-writes',
        targetNode: 'redis-master',
        opsPerSecond: 3000,
        readRatio: 0.3,
        keyPattern: 'random',
        valueSize: 'small',
      },
      {
        id: 'client-app-reads',
        targetNode: 'redis-replica-1',
        opsPerSecond: 5000,
        readRatio: 1.0,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 10, type: 'node-down', target: 'redis-master', params: { reason: 'crash' } },
    { atTick: 5, type: 'node-down', target: 'sentinel-1', params: { reason: 'pre-existing-failure' } },
  ],
  victoryConditions: [
    {
      id: 'master-online',
      description: 'A master node is back online',
      required: true,
      check: s => {
        for (const [, node] of s.nodes) {
          if (node.config.role === 'master' && node.isOnline) return true
        }
        return false
      },
    },
    {
      id: 'healthy-system',
      description: 'System health above 75',
      required: true,
      check: s => s.systemHealthScore > 75,
    },
  ],
  conceptCards: [
    {
      concept: 'quorum',
      title: 'Sentinel Quorum',
      body: 'Quorum is the minimum number of Sentinels that must agree a master is down before failover begins. With N Sentinels, set quorum = ceil(N/2). For 3 Sentinels: quorum=2. For 5 Sentinels: quorum=3. Always run an odd number of Sentinels on separate failure domains (separate hosts/AZs).',
      showWhenFixed: true,
    },
    {
      concept: 'Sentinel',
      title: 'Redis Sentinel Architecture',
      body: 'Sentinels monitor master/replica health, agree on failover, and reconfigure clients via the Sentinel service discovery endpoint. Clients connect to Sentinel and ask "who is the master?" on startup and reconnect. Three minimum Sentinels on separate hosts; five for production with >= 2 AZs.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['add-sentinel-node', 'promote-replica', 'adjust-quorum', 'restart-node'],
}

export default scenario
