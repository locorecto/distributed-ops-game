import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'microservices-bus',
  index: 16,
  title: 'Microservices Event Bus',
  subtitle: 'Hard · Dead Letter Queue & Error Handling',
  difficulty: 'hard',
  estimatedMinutes: 15,
  coverConcepts: ['dlq', 'retry-logic', 'error-handling'],
  maxLagForHealth: 300,

  briefing: {
    story: "EventMesh routes events between 12 microservices. A malformed JSON payload from a buggy producer is causing consumer deserialization errors at a 30% rate. Without error handling, failed messages are retried endlessly and the consumer is stuck — blocking all other valid messages.",
    symptom: "Consumer error rate is 30%. Failed messages are blocking the queue. The consumer is stuck retrying bad messages.",
    goal: "Enable Dead Letter Queue (DLQ) routing so failed messages are moved to a separate topic instead of blocking processing.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Without a DLQ, a message that always fails will loop forever and block all messages behind it. The consumer needs a way to 'park' bad messages and move on.",
        relatedConcept: 'dlq',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Enable DLQ routing in the consumer config. Failed messages (after max retries) will be forwarded to a DLQ topic for inspection instead of blocking the pipeline. Then configure max retries and retry backoff.",
        relatedConcept: 'retry-logic',
        highlightElements: ['consumer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'service-events',
      partitionCount: 4,
      replicationFactor: 1,
      retentionMs: 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-event-emitter',
      targetTopic: 'service-events',
      messagesPerSecond: 20,
      acks: 1,
      keyStrategy: 'random',
    }],
    consumers: [{
      id: 'consumer-event-router',
      groupId: 'router-group',
      subscribedTopics: ['service-events'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,
      maxPollRecords: 100,
      processingTimeMs: 20,
      errorRate: 0.3,   // 30% error rate simulating bad messages
      dlqEnabled: false, // BUG: no DLQ → infinite retry loop
      maxRetries: 0,
    }],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'dlq-enabled',
      description: 'DLQ routing enabled',
      required: true,
      check: s => s.consumers.get('consumer-event-router')?.config.dlqEnabled === true,
    },
    {
      id: 'error-rate-ok',
      description: 'Processing error rate below 5%',
      required: true,
      check: s => s.metrics.errorRate < 0.05,
    },
    {
      id: 'lag-ok',
      description: 'Consumer lag below 150',
      required: true,
      check: s => s.metrics.totalLag < 150,
    },
  ],

  conceptCards: [
    {
      concept: 'dlq',
      title: 'Dead Letter Queue (DLQ)',
      body: "A DLQ is a special topic where messages that fail processing (after max retries) are routed for later inspection and replay. Without a DLQ, a single bad message can block an entire partition indefinitely. DLQs make pipelines resilient to poison pills.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['add-dlq', 'configure-retry'],
}

export default scenario
