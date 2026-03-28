import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'chat-fanout',
  index: 4,
  title: 'Chat App Fan-Out',
  subtitle: 'Easy · Consumer Groups & Offset Reset',
  difficulty: 'easy',
  estimatedMinutes: 8,
  coverConcepts: ['consumer-group', 'auto-offset-reset', 'fan-out', 'offset-reset', 'consumer-group-isolation'],
  maxLagForHealth: 300,

  briefing: {
    story: "ChatFlow has three services reading from the same 'chat-messages' topic: storage-service (saves messages to DB), notification-service (sends push notifications), and analytics-service (tracks engagement). The analytics team added their consumer with auto.offset.reset=latest — now their dashboard shows zero messages and the team is panicking.",
    symptom: "analytics-group consumer has zero messages processed. The dashboard is completely empty.",
    goal: "Reset the analytics consumer group offset to 'earliest' so it re-reads all historical messages. Lag should go to zero.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "The analytics consumer joined late with auto.offset.reset=latest, which means it only reads NEW messages — it skipped all existing ones. Check the consumer config.",
        relatedConcept: 'auto-offset-reset',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Use 'Reset Consumer Group Offset' for the analytics-group and set it to 'earliest'. This rewinds their offset to the beginning of the topic so they process all messages.",
        relatedConcept: 'offset-reset',
        highlightElements: ['consumer-analytics-config'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'chat-messages',
      partitionCount: 3,
      replicationFactor: 1,
      retentionMs: 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-chat-api',
      targetTopic: 'chat-messages',
      messagesPerSecond: 10,
      acks: 1,
      keyStrategy: 'random',
    }],
    consumers: [
      { id: 'consumer-storage', groupId: 'storage-group', subscribedTopics: ['chat-messages'], autoOffsetReset: 'earliest', enableAutoCommit: true, maxPollRecords: 100, processingTimeMs: 10 },
      { id: 'consumer-notifications', groupId: 'notification-group', subscribedTopics: ['chat-messages'], autoOffsetReset: 'earliest', enableAutoCommit: true, maxPollRecords: 100, processingTimeMs: 10 },
      { id: 'consumer-analytics', groupId: 'analytics-group', subscribedTopics: ['chat-messages'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 100, processingTimeMs: 10 },
    ],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'analytics-catching-up',
      description: 'Analytics consumer has processed messages',
      required: true,
      check: s => {
        const analytics = s.consumers.get('consumer-analytics')
        return analytics != null && analytics.totalProcessed > 50
      },
    },
    {
      id: 'lag-low',
      description: 'Total lag below 100',
      required: true,
      check: s => s.metrics.totalLag < 100,
    },
  ],

  conceptCards: [
    {
      concept: 'fan-out',
      title: 'Fan-Out Pattern',
      body: "Multiple consumer groups can independently read from the same topic, each maintaining their own offsets. This is the fan-out pattern — one topic feeds many downstream services without any coupling between them.",
      showWhenFixed: true,
    },
    {
      concept: 'auto-offset-reset',
      title: 'auto.offset.reset',
      body: "Controls where a new consumer group starts reading: 'earliest' reads from the very beginning of the topic, 'latest' only reads new messages. Choose 'earliest' when you need historical data, 'latest' when you only care about new events.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['reset-consumer-group-offset', 'set-offset-reset'],
}

export default scenario
