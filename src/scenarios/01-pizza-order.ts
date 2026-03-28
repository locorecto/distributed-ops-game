import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'pizza-order',
  index: 1,
  title: 'Pizza Order System',
  subtitle: 'Beginner · Topic Basics',
  difficulty: 'beginner',
  estimatedMinutes: 5,
  coverConcepts: ['topic', 'producer', 'consumer', 'consumer-lag'],
  maxLagForHealth: 200,

  briefing: {
    story: "PizzaCo just launched their online ordering platform. Orders come in through the website and a kitchen app processes them. But the kitchen is falling behind — customers are waiting over an hour!",
    symptom: "Consumer lag is growing fast. Orders are piling up and the kitchen can't keep up.",
    goal: "Reduce consumer lag below 50 messages and keep it there for 10 seconds.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "The consumer is processing messages too slowly. Look at the 'Max Poll Records' setting — increasing it lets the consumer fetch more orders per poll cycle.",
        relatedConcept: 'consumer-lag',
        highlightElements: ['consumer-kitchen'],
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Try setting Max Poll Records to 50 or higher. You can also add a second consumer to the same group — Kafka will split the load.",
        relatedConcept: 'consumer-group',
        highlightElements: ['consumer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0, diskCapacityBytes: 10 * 1024 * 1024 * 1024 }],
    topics: [{
      name: 'pizza-orders',
      partitionCount: 3,
      replicationFactor: 1,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-website',
      targetTopic: 'pizza-orders',
      messagesPerSecond: 5,
      acks: 1,
      keyStrategy: 'random',
      messageSizeBytes: 512,
    }],
    consumers: [{
      id: 'consumer-kitchen',
      groupId: 'kitchen-group',
      subscribedTopics: ['pizza-orders'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,
      maxPollRecords: 3,
      processingTimeMs: 5,   // fast processing — maxPollRecords is the throughput bottleneck
      sessionTimeoutMs: 10000,
      heartbeatIntervalMs: 3000,
    }],
  },

  failureScript: [
    // Rush hour hits: orders spike to 60/sec, consumer (only 3/tick = 30/sec) falls behind
    { atTick: 20, type: 'producer-rate-spike', target: 'producer-website', params: { rate: 60 } },
  ],

  victoryConditions: [
    {
      id: 'lag-low',
      description: 'Consumer lag below 50 messages',
      required: true,
      check: s => s.metrics.totalLag < 50,
    },
    {
      id: 'health-good',
      description: 'System health above 75%',
      required: true,
      check: s => s.systemHealthScore > 75,
    },
  ],

  conceptCards: [
    {
      concept: 'consumer-lag',
      title: 'Consumer Lag',
      body: "Lag is the gap between the latest message offset in a partition and the consumer's committed offset. High lag means the consumer can't keep up with the producer. Fix by increasing poll batch size or adding more consumers.",
      showWhenFixed: true,
    },
    {
      concept: 'consumer-group',
      title: 'Consumer Groups',
      body: "Multiple consumers in the same group share the work of reading from a topic. Kafka assigns each partition to exactly one consumer in the group — this is how Kafka scales message processing horizontally.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['set-max-poll-records', 'add-consumer', 'set-offset-reset'],
}

export default scenario
