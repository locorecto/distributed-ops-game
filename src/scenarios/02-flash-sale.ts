import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'flash-sale',
  index: 2,
  title: 'Flash Sale Inventory',
  subtitle: 'Easy · Partitions & Consumer Groups',
  difficulty: 'easy',
  estimatedMinutes: 8,
  coverConcepts: ['partition', 'consumer-group', 'consumer-lag'],
  maxLagForHealth: 500,

  briefing: {
    story: "ShopFast runs a flash sale every Friday. This week, 10,000 concurrent customers hit the site. The single-partition inventory topic is completely overwhelmed — orders are backing up and customers are seeing stale stock counts.",
    symptom: "Massive consumer lag spike when the flash sale starts. One consumer can't handle the traffic.",
    goal: "Reduce consumer lag below 100 messages by adding partitions and scaling consumer group.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The single partition is a bottleneck — only one consumer can read from it at a time. Add more partitions to the 'inventory-updates' topic to allow parallel consumption.",
        relatedConcept: 'partition',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Once you have more partitions, add more consumers to the 'inventory-group'. Kafka will automatically assign partitions to each consumer. You need at least as many consumers as partitions to fully utilise them.",
        relatedConcept: 'consumer-group',
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'inventory-updates',
      partitionCount: 1,
      replicationFactor: 1,
      retentionMs: 3 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-storefront',
      targetTopic: 'inventory-updates',
      messagesPerSecond: 5,
      acks: 1,
      keyStrategy: 'random',
    }],
    consumers: [{
      id: 'consumer-inventory-1',
      groupId: 'inventory-group',
      subscribedTopics: ['inventory-updates'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,
      maxPollRecords: 100,
      processingTimeMs: 20,
      sessionTimeoutMs: 10000,
      heartbeatIntervalMs: 3000,
    }],
  },

  failureScript: [
    { atTick: 20, type: 'consumer-lag-spike', target: 'all', params: { producerRateMultiplier: 20 } },
  ],

  victoryConditions: [
    { id: 'lag-low', description: 'Consumer lag below 100', required: true, check: s => s.metrics.totalLag < 100 },
    { id: 'health-good', description: 'System health above 75%', required: true, check: s => s.systemHealthScore > 75 },
  ],

  conceptCards: [
    {
      concept: 'partition',
      title: 'Partitions',
      body: "Partitions are the unit of parallelism in Kafka. A topic with N partitions can be consumed by up to N consumers in the same group simultaneously. Adding partitions is the primary way to scale Kafka throughput.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['add-partitions', 'add-consumer', 'set-consumer-group'],
}

export default scenario
