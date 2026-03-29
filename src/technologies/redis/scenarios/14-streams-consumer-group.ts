import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-14-streams-consumer-group',
  index: 14,
  title: 'Redis Streams Consumer Group',
  subtitle: 'Medium-Hard · Streams',
  difficulty: 'medium-hard',
  estimatedMinutes: 25,
  coverConcepts: ['Redis Streams', 'consumer group', 'PEL', 'XPENDING', 'XCLAIM', 'XACK', 'dead consumer'],
  briefing: {
    story:
      'Your event processing pipeline uses a Redis Streams consumer group with 3 consumers reading from an orders stream. Consumer-2 crashed 6 hours ago and has never restarted. Its pending entry list (PEL) has grown to 100,000 unacknowledged messages — these are orders that were delivered to Consumer-2 but never processed or acknowledged. Consumer-1 and Consumer-3 cannot process these messages; they are stuck in Consumer-2\'s PEL forever.',
    symptom:
      'XPENDING shows 100,000 messages in Consumer-2\'s PEL. Order processing is backed up. Some orders are hours overdue. Consumer-1 and Consumer-3 are idle — all new messages have been processed, but the old PEL messages are unreachable.',
    goal:
      'Use XPENDING to inspect Consumer-2\'s stuck messages. Use XCLAIM to reassign messages idle for more than 60 seconds to active consumers. Optionally use XAUTOCLAIM (Redis 7.0+) to automate this. Reduce error rate below 1% and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'Run XPENDING orders group-name - + 10 to see Consumer-2\'s pending messages and how long they\'ve been idle.',
        relatedConcept: 'XPENDING',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'XCLAIM orders group-name consumer-1 60000 <message-id> reassigns a message idle for 60s+ to consumer-1.',
        relatedConcept: 'XCLAIM',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'XAUTOCLAIM orders group-name consumer-1 60000 0-0 COUNT 100 claims up to 100 messages idle for 60s+ in one command. Schedule this periodically as a watchdog.',
        relatedConcept: 'dead consumer',
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
        evictionPolicy: 'noeviction',
        persistenceMode: 'aof',
        appendfsync: 'everysec',
        maxClients: 500,
      },
    ],
    clients: [
      {
        id: 'client-stream-producer',
        targetNode: 'redis-master',
        opsPerSecond: 500,
        readRatio: 0.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
      {
        id: 'client-consumer-1',
        targetNode: 'redis-master',
        opsPerSecond: 250,
        readRatio: 1.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
      {
        id: 'client-consumer-2',
        targetNode: 'redis-master',
        opsPerSecond: 0,
        readRatio: 1.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
      {
        id: 'client-consumer-3',
        targetNode: 'redis-master',
        opsPerSecond: 250,
        readRatio: 1.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'node-down', target: 'redis-master', params: { consumer: 'client-consumer-2', reason: 'crash' } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
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
      concept: 'PEL',
      title: 'Pending Entry List (PEL)',
      body: 'When a consumer reads a message with XREADGROUP, the message is added to that consumer\'s PEL (Pending Entry List). It stays there until XACK is called. If a consumer crashes, its PEL entries are stuck. XPENDING shows them; XCLAIM reassigns them to a living consumer.',
      showWhenFixed: true,
    },
    {
      concept: 'XCLAIM',
      title: 'XCLAIM and XAUTOCLAIM',
      body: 'XCLAIM transfers ownership of a pending message to another consumer, but only if the message has been idle (unacknowledged) for at least min-idle-time milliseconds. XAUTOCLAIM (Redis 7.0+) claims multiple messages in one call and returns the new cursor position for batch processing.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['xclaim-messages', 'xautoclaim', 'restart-consumer', 'inspect-pending'],
}

export default scenario
