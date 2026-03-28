import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'payment-gateway',
  index: 7,
  title: 'Payment Gateway',
  subtitle: 'Medium · Idempotent Producers & Exactly-Once',
  difficulty: 'medium',
  estimatedMinutes: 12,
  coverConcepts: ['idempotent-producer', 'exactly-once', 'message-ordering', 'at-least-once'],
  maxLagForHealth: 200,

  briefing: {
    story: "PaySecure processes credit card transactions. During a network hiccup, the producer retried failed sends — and now some transactions were debited twice. Customers are disputing charges and the fraud team is swamped.",
    symptom: "Duplicate messages detected. The same payment transaction is being processed multiple times.",
    goal: "Enable idempotent producer to eliminate duplicates. Bring duplicate count to zero.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "The producer has retries enabled. When a network error occurs and the producer retries, Kafka might receive the message twice if the first send actually succeeded. This is the at-least-once delivery problem.",
        relatedConcept: 'at-least-once',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Enable 'Idempotent Producer' in the producer config. This assigns sequence numbers to each message — Kafka's broker deduplicates using these sequence numbers, guaranteeing exactly-once delivery per partition.",
        relatedConcept: 'idempotent-producer',
        highlightElements: ['producer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'payment-transactions',
      partitionCount: 3,
      replicationFactor: 1,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-gateway',
      targetTopic: 'payment-transactions',
      messagesPerSecond: 20,
      acks: 1,
      retries: 5,
      idempotent: false, // BUG: not idempotent → duplicates on retry
      keyStrategy: 'random',
      messageSizeBytes: 256,
    }],
    consumers: [{
      id: 'consumer-payment-processor',
      groupId: 'payment-group',
      subscribedTopics: ['payment-transactions'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,
      maxPollRecords: 100,
      processingTimeMs: 30,
      sessionTimeoutMs: 10000,
      heartbeatIntervalMs: 3000,
    }],
  },

  failureScript: [
    { atTick: 20, type: 'duplicate-messages', target: 'producer-gateway', params: {} },
  ],

  victoryConditions: [
    {
      id: 'no-duplicates',
      description: 'Duplicate count = 0',
      required: true,
      check: s => s.metrics.duplicateCount === 0,
    },
    {
      id: 'lag-low',
      description: 'Consumer lag below 100',
      required: true,
      check: s => s.metrics.totalLag < 100,
    },
  ],

  conceptCards: [
    {
      concept: 'idempotent-producer',
      title: 'Idempotent Producer',
      body: "An idempotent producer assigns a monotonically increasing sequence number to each message per partition. The broker rejects duplicates using these sequence numbers. Enabling idempotence automatically sets acks=all and retries≥1.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['enable-idempotence', 'set-producer-acks'],
}

export default scenario
