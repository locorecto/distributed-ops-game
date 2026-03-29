import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-15-keyspace-notifications',
  index: 15,
  title: 'Keyspace Notification Flood',
  subtitle: 'Medium-Hard · Keyspace Notifications',
  difficulty: 'medium-hard',
  estimatedMinutes: 22,
  coverConcepts: ['keyspace notifications', 'notify-keyspace-events', 'event filtering', 'Pub/Sub', 'consumer lag'],
  briefing: {
    story:
      'A session cleanup service subscribes to Redis keyspace notifications to detect expired session keys and clean up associated user data. The configuration was set to notify-keyspace-events=KEA (all key events, all commands). Now every SET, GET, LPUSH, ZADD — every single Redis operation — generates a notification. The service is receiving 500,000 events/second instead of the ~100 expiry events/second it needs. Consumer lag is growing, the Pub/Sub channel is saturated, and the cleanup service is crash-looping.',
    symptom:
      'Keyspace notification channel is flooded with 500K events/sec. Consumer lag is growing unbounded. The cleanup service CPU is 100%. Only 0.02% of events are relevant (expiry events). 99.98% are noise.',
    goal:
      'Restrict keyspace notifications to only expired-key events: notify-keyspace-events=Ex. Add rate limiting in the consumer. Reduce error rate below 2% and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'notify-keyspace-events=KEA enables ALL events. The "A" flag = all commands. This includes every read/write operation on every key.',
        relatedConcept: 'notify-keyspace-events',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'Use notify-keyspace-events=Ex to only emit events when keys expire. "E" = keyspace events, "x" = expired events only.',
        relatedConcept: 'event filtering',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'Keyspace notifications use Pub/Sub internally. They add overhead to every matching command. Only enable the minimum event types needed. Consider using a dedicated Redis instance for notifications.',
        relatedConcept: 'keyspace notifications',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 2048,
        evictionPolicy: 'volatile-lru',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 1000,
      },
    ],
    clients: [
      {
        id: 'client-app-operations',
        targetNode: 'redis-master',
        opsPerSecond: 50000,
        readRatio: 0.7,
        keyPattern: 'random',
        valueSize: 'small',
      },
      {
        id: 'client-cleanup-service',
        targetNode: 'redis-master',
        opsPerSecond: 100,
        readRatio: 1.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'hot-key', target: 'redis-master', params: { reason: 'notification-flood', eventsPerSec: 500000 } },
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
      concept: 'keyspace notifications',
      title: 'Keyspace Notifications',
      body: 'Keyspace notifications publish messages when keys are modified or expire. The notify-keyspace-events config controls which events fire. Flags: K=keyspace, E=keyevent, g=generic commands, $=string, l=list, z=sorted set, x=expired, e=evicted, A=all. Only enable what you need — each event adds latency to the triggering command.',
      showWhenFixed: true,
    },
    {
      concept: 'event filtering',
      title: 'Filtering Keyspace Events',
      body: 'Use the minimum flag set: Ex for expiry only, Kg for key-generic events, Kz for sorted set events. Avoid "A" (all commands) in production — it generates events for every read and write, including GETs. High event volume can saturate Pub/Sub channels and starve real subscribers.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['set-keyspace-events', 'add-consumer-rate-limit', 'add-dedicated-instance'],
}

export default scenario
