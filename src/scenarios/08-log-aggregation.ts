import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'log-aggregation',
  index: 8,
  title: 'Log Aggregation Pipeline',
  subtitle: 'Medium · Retention Policies',
  difficulty: 'medium',
  estimatedMinutes: 10,
  coverConcepts: ['retention-time', 'retention-bytes', 'log-compaction'],
  maxLagForHealth: 300,

  briefing: {
    story: "LogStream aggregates application logs from 50 microservices. The broker disk is filling up fast — at current rates it'll be full in 3 hours. Logs older than 4 hours are useless for debugging but retention is set to 30 days.",
    symptom: "Broker disk usage is at 85% and growing. The topic retains 30 days of logs but the team only needs 4 hours.",
    goal: "Set retention.ms to 4 hours (14,400,000ms) and retention.bytes to 2GB to stop the disk from filling up.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "Kafka's default retention is 7 days, but log data is rarely useful after a few hours for debugging. Reduce retention.ms on the 'app-logs' topic to match your actual needs.",
        relatedConcept: 'retention-time',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Also set retention.bytes to cap the maximum disk usage per topic regardless of time. Setting it to 2GB (2147483648 bytes) provides a hard ceiling.",
        relatedConcept: 'retention-bytes',
        highlightElements: ['retention-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0, diskCapacityBytes: 5 * 1024 * 1024 * 1024 }],
    topics: [{
      name: 'app-logs',
      partitionCount: 6,
      replicationFactor: 1,
      retentionMs: 30 * 24 * 60 * 60 * 1000, // BUG: 30 days
      retentionBytes: -1,                      // BUG: unlimited
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-log-shipper',
      targetTopic: 'app-logs',
      messagesPerSecond: 50,
      acks: 1,
      keyStrategy: 'random',
      messageSizeBytes: 1024,
    }],
    consumers: [{
      id: 'consumer-log-indexer',
      groupId: 'indexer-group',
      subscribedTopics: ['app-logs'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,
      maxPollRecords: 200,
      processingTimeMs: 15,
    }],
  },

  failureScript: [
    { atTick: 10, type: 'retention-overflow', target: 'broker-0', params: {} },
  ],

  victoryConditions: [
    {
      id: 'retention-tuned',
      description: 'Topic retention.ms ≤ 14,400,000 (4 hours)',
      required: true,
      check: s => {
        const topic = s.topics.get('app-logs')
        return topic != null && topic.config.retentionMs <= 14_400_000
      },
    },
    {
      id: 'lag-ok',
      description: 'Consumer lag below 300',
      required: true,
      check: s => s.metrics.totalLag < 300,
    },
  ],

  conceptCards: [
    {
      concept: 'retention-time',
      title: 'Retention by Time',
      body: "retention.ms controls how long Kafka keeps messages. After this duration, the oldest log segments are deleted. Setting it to the minimum needed prevents unbounded disk growth.",
      showWhenFixed: true,
    },
    {
      concept: 'retention-bytes',
      title: 'Retention by Size',
      body: "retention.bytes caps the total size of a topic's log per partition. When the limit is hit, the oldest segments are evicted regardless of their age. Use both time and size retention as complementary safeguards.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-retention-ms', 'set-retention-bytes', 'set-cleanup-policy'],
}

export default scenario
