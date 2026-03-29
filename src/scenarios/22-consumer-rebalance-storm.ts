import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'consumer-rebalance-storm',
  index: 22,
  title: 'Consumer Rebalance Storm',
  subtitle: 'Hard · Rebalancing & Session Timeouts',
  difficulty: 'hard',
  estimatedMinutes: 16,
  coverConcepts: ['consumer-group', 'session-timeout', 'heartbeat'],
  maxLagForHealth: 250,

  briefing: {
    story: "A flash-sale event processing application auto-scales its consumer group from 2 to 10 instances as orders spike during a major promotion. The group uses the default eager rebalance protocol: every time a new consumer joins, ALL partition assignments are revoked, all consumers stop processing, and the group coordinator runs a full reassignment from scratch. Each cycle takes ~8 seconds. With 8 new consumers joining in rapid succession, the group spends more time rebalancing than processing — and sale orders are piling up.",
    symptom: "Consumer lag spikes every time a new consumer instance joins the group. The entire consumer group pauses for 8 seconds per rebalance event. During peak traffic this compounds into multi-minute processing gaps. The sale order backlog is growing faster than consumers can drain it.",
    goal: "Tune session.timeout.ms and heartbeat.interval.ms to prevent spurious rebalances triggered by GC pauses. Add additional consumer instances to the group to increase throughput once the rebalance storm subsides. Reduce total consumer lag below 100.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The root cause is the session.timeout.ms being too short relative to the GC pause times of each consumer. When a consumer takes longer than session.timeout.ms to send a heartbeat, the coordinator declares it dead and triggers a rebalance. Increase session.timeout.ms (e.g. to 45s) and set heartbeat.interval.ms to one-third of that value.",
        relatedConcept: 'session-timeout',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "With session.timeout.ms stabilised, add the remaining consumer instances to the group. The group now has enough capacity to drain the lag backlog. Also increase max.poll.records so each consumer fetches larger batches per poll cycle, improving throughput.",
        relatedConcept: 'heartbeat',
        highlightElements: ['consumer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [
      { id: 0 },
      { id: 1 },
      { id: 2 },
    ],
    topics: [
      {
        name: 'sale-orders',
        partitionCount: 12,
        replicationFactor: 3,
        retentionMs: 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 2,
        messageMaxBytes: 1_048_576,
      },
    ],
    producers: [
      {
        id: 'producer-order-gateway',
        targetTopic: 'sale-orders',
        messagesPerSecond: 80,
        acks: -1,
        keyStrategy: 'random',
        messageSizeBytes: 512,
      },
    ],
    consumers: [
      {
        id: 'consumer-order-processor-1',
        groupId: 'order-processor-group',
        subscribedTopics: ['sale-orders'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 50,          // BUG: too small, slow drain
        sessionTimeoutMs: 6000,      // BUG: too short, triggers spurious rebalances
        heartbeatIntervalMs: 3000,   // BUG: too close to session timeout
        maxPollIntervalMs: 300000,
        processingTimeMs: 60,
      },
      {
        id: 'consumer-order-processor-2',
        groupId: 'order-processor-group',
        subscribedTopics: ['sale-orders'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 50,
        sessionTimeoutMs: 6000,
        heartbeatIntervalMs: 3000,
        maxPollIntervalMs: 300000,
        processingTimeMs: 60,
      },
    ],
  },

  failureScript: [
    {
      atTick: 20,
      type: 'consumer-lag-spike',
      target: 'all',
      params: { producerRateMultiplier: 4, reason: 'rebalance-storm' },
    },
  ],

  victoryConditions: [
    {
      id: 'lag-drained',
      description: 'Total consumer lag below 100',
      required: true,
      check: s => s.metrics.totalLag < 100,
    },
    {
      id: 'group-stable',
      description: 'Consumer group is in stable state (no active rebalance)',
      required: true,
      check: s => {
        const group = s.consumerGroups.get('order-processor-group')
        return group?.state === 'stable' && (group?.rebalancingTicksLeft ?? 0) === 0
      },
    },
    {
      id: 'health-restored',
      description: 'System health above 70%',
      required: true,
      check: s => s.systemHealthScore > 70,
    },
  ],

  conceptCards: [
    {
      concept: 'session-timeout',
      title: 'Session Timeout & Heartbeats',
      body: "Kafka's consumer liveness detection relies on two timers: session.timeout.ms (how long the broker waits before declaring a consumer dead) and heartbeat.interval.ms (how often the consumer sends a keep-alive). Setting session.timeout.ms too low causes spurious rebalances when consumers experience GC pauses or slow I/O. The general rule is heartbeat.interval.ms = session.timeout.ms / 3.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-session-timeout', 'set-heartbeat', 'add-consumer', 'set-max-poll-records'],
}

export default scenario
