import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'fraud-detection',
  index: 18,
  title: 'Fraud Detection Engine',
  subtitle: 'Expert · Kafka Streams & Windowing',
  difficulty: 'expert',
  estimatedMinutes: 20,
  coverConcepts: ['kafka-streams', 'windowing', 'stateful-joins'],
  maxLagForHealth: 300,

  briefing: {
    story: "BankShield detects fraud by counting transactions per card in a 5-minute window. If a card has >10 transactions in 5 minutes, it triggers a fraud alert. The stream processor's window is misconfigured to 60 minutes — fraud alerts are arriving an hour late, letting fraudsters drain accounts.",
    symptom: "Fraud alerts delayed by 60 minutes. The stream processor window is too large — by the time an alert fires, the damage is done.",
    goal: "Reduce the stream processor's tumbling window to 5 minutes (300,000ms). Alert latency should drop below 30 seconds.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The stream processor is using a 60-minute tumbling window. It accumulates all transactions for an hour before evaluating the fraud rule. A 5-minute window fires alerts much faster.",
        relatedConcept: 'windowing',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Reduce windowSizeMs from 3,600,000 to 300,000 (5 minutes). The state store will maintain counts per cardId within each window. When the window closes, it emits an aggregate to the fraud-alerts topic.",
        relatedConcept: 'kafka-streams',
        highlightElements: ['stream-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [
      {
        name: 'card-transactions',
        partitionCount: 6,
        replicationFactor: 1,
        retentionMs: 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
      {
        name: 'fraud-alerts',
        partitionCount: 3,
        replicationFactor: 1,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
    ],
    producers: [{
      id: 'producer-pos-terminals',
      targetTopic: 'card-transactions',
      messagesPerSecond: 30,
      acks: 1,
      keyStrategy: 'random',
    }],
    consumers: [
      {
        id: 'consumer-fraud-processor',
        groupId: 'fraud-group',
        subscribedTopics: ['card-transactions'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 15,
        errorRate: 0.02,
      },
      {
        id: 'consumer-alert-handler',
        groupId: 'alert-group',
        subscribedTopics: ['fraud-alerts'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 100,
        processingTimeMs: 50,
      },
    ],
  },

  failureScript: [
    { atTick: 10, type: 'consumer-lag-spike', target: 'all', params: { producerRateMultiplier: 3 } },
  ],

  victoryConditions: [
    {
      id: 'lag-ok',
      description: 'Consumer lag below 150',
      required: true,
      check: s => s.metrics.totalLag < 150,
    },
    {
      id: 'health-ok',
      description: 'System health above 75%',
      required: true,
      check: s => s.systemHealthScore > 75,
    },
  ],

  conceptCards: [
    {
      concept: 'windowing',
      title: 'Stream Windowing',
      body: "Kafka Streams supports tumbling windows (fixed non-overlapping time buckets), hopping windows (overlapping), and session windows (activity-based). Tumbling windows are ideal for periodic aggregations like fraud detection — they fire exactly once per window period.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['add-stream-processor', 'configure-window', 'add-partitions'],
}

export default scenario
