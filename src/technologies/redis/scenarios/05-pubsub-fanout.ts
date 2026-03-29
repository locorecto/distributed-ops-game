import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-05-pubsub-fanout',
  index: 5,
  title: 'Pub/Sub Fan-Out Failure',
  subtitle: 'Easy · Messaging Patterns',
  difficulty: 'easy',
  estimatedMinutes: 15,
  coverConcepts: ['Pub/Sub', 'Redis Streams', 'XADD', 'XREADGROUP', 'message persistence', 'consumer groups'],
  briefing: {
    story:
      'Your notifications service uses Redis Pub/Sub to fan out alerts to 20 subscriber microservices. During a routine rolling deployment, subscribers restart one by one. Every message published while a subscriber is offline is permanently lost — Pub/Sub has no buffering. After the deployment, 15,000 notification messages vanished. Users never received alerts about their orders.',
    symptom:
      'Error rate is high due to missed messages. Subscribers that restarted report zero messages received during the deployment window. There is no dead-letter queue or replay mechanism.',
    goal:
      'Migrate from Pub/Sub to Redis Streams (XADD for publishing, XREADGROUP for consuming). Streams persist messages and support consumer groups with acknowledgement. Achieve error rate < 1% and cache hit rate > 90%.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 50,
        text: 'Redis Pub/Sub is fire-and-forget. Messages are delivered only to currently-connected subscribers. No persistence, no replay.',
        relatedConcept: 'Pub/Sub',
      },
      {
        order: 2,
        triggerOnHealthBelow: 35,
        text: 'Redis Streams (XADD) persist messages to a log. XREADGROUP lets consumer groups read from a position and acknowledge messages.',
        relatedConcept: 'Redis Streams',
      },
      {
        order: 3,
        triggerOnHealthBelow: 20,
        text: 'Create a consumer group: XGROUP CREATE notifications mygroup $ MKSTREAM. Consumers use XREADGROUP GROUP mygroup consumer1 COUNT 10 STREAMS notifications >',
        relatedConcept: 'XREADGROUP',
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
        evictionPolicy: 'noeviction',
        persistenceMode: 'aof',
        appendfsync: 'everysec',
        maxClients: 500,
      },
    ],
    clients: [
      {
        id: 'client-notifications-publisher',
        targetNode: 'redis-master',
        opsPerSecond: 1000,
        readRatio: 0.1,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
      {
        id: 'client-notifications-subscriber',
        targetNode: 'redis-master',
        opsPerSecond: 1000,
        readRatio: 0.9,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 20, type: 'node-down', target: 'redis-master', params: { reason: 'subscriber-restart' } },
    { atTick: 40, type: 'memory-pressure', target: 'redis-master', params: {} },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'high-hit-rate',
      description: 'Cache hit rate above 90%',
      required: true,
      check: s => s.metrics.cacheHitRate > 0.9,
    },
  ],
  conceptCards: [
    {
      concept: 'Pub/Sub',
      title: 'Redis Pub/Sub Limitations',
      body: 'Pub/Sub delivers messages only to currently-subscribed clients. Messages are not stored. If a subscriber is offline, disconnected, or slow, messages are dropped. Do not use Pub/Sub for reliable messaging or event sourcing.',
      showWhenFixed: true,
    },
    {
      concept: 'Redis Streams',
      title: 'Redis Streams for Reliable Messaging',
      body: 'Streams are an append-only log with consumer group support. XADD appends; XREADGROUP reads and tracks delivery; XACK acknowledges. Unacknowledged messages are retried. Supports multiple independent consumer groups reading the same stream.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['switch-to-streams', 'create-consumer-group', 'set-persistence-mode'],
}

export default scenario
