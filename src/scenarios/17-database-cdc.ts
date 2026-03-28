import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'database-cdc',
  index: 17,
  title: 'Database CDC Sync',
  subtitle: 'Hard · Log Compaction & Exactly-Once',
  difficulty: 'hard',
  estimatedMinutes: 18,
  coverConcepts: ['log-compaction', 'exactly-once', 'message-key', 'retention-time'],
  maxLagForHealth: 200,

  briefing: {
    story: "DataSync streams database changes (CDC) to downstream systems. The 'user-profiles' topic retains every update ever made — 8 million change events for 500,000 users. New consumers reading from the beginning take 45 minutes to bootstrap. The topic is also growing unboundedly.",
    symptom: "New consumers take too long to bootstrap. Topic is massive (8M events for 500K users). Only the latest profile state matters.",
    goal: "Switch cleanup.policy to 'compact' so Kafka retains only the latest value per userId key. Bootstrap time should drop dramatically.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "This is a CDC topic — each message represents the latest state of an entity. You don't need history, only the current value. Log compaction keeps only the latest message per key and deletes older versions.",
        relatedConcept: 'log-compaction',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Set cleanup.policy to 'compact'. Ensure your producer is using message.key=userId so Kafka knows which messages represent the same entity. To delete a record, produce a tombstone (null value) for that key.",
        relatedConcept: 'log-compaction',
        highlightElements: ['retention-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'user-profiles',
      partitionCount: 6,
      replicationFactor: 1,
      retentionMs: -1,             // BUG: infinite retention, grows forever
      retentionBytes: -1,
      cleanupPolicy: 'delete',     // BUG: delete policy, keeps all history
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-cdc',
      targetTopic: 'user-profiles',
      messagesPerSecond: 25,
      acks: -1,
      keyStrategy: 'fixed',
      fixedKey: 'userId',
      idempotent: true,
    }],
    consumers: [{
      id: 'consumer-search-indexer',
      groupId: 'search-group',
      subscribedTopics: ['user-profiles'],
      autoOffsetReset: 'earliest',
      enableAutoCommit: true,
      maxPollRecords: 200,
      processingTimeMs: 25,
    }],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'compaction-enabled',
      description: 'cleanup.policy = compact',
      required: true,
      check: s => s.topics.get('user-profiles')?.config.cleanupPolicy === 'compact',
    },
    {
      id: 'lag-ok',
      description: 'Consumer lag below 100',
      required: true,
      check: s => s.metrics.totalLag < 100,
    },
  ],

  conceptCards: [
    {
      concept: 'log-compaction',
      title: 'Log Compaction',
      body: "With cleanup.policy=compact, Kafka guarantees that for each unique key, at least the latest message is retained. Older messages with the same key are removed during compaction. This is ideal for event-sourced state topics — consumers can bootstrap from scratch and get current state without replaying all history.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-cleanup-policy', 'set-retention-ms', 'set-producer-key'],
}

export default scenario
