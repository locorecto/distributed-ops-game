import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'log-compaction-deep-dive',
  index: 21,
  title: 'Log Compaction Deep Dive',
  subtitle: 'Hard · Compaction & Retention',
  difficulty: 'hard',
  estimatedMinutes: 18,
  coverConcepts: ['log-compaction', 'retention-bytes', 'retention-time'],
  maxLagForHealth: 300,

  briefing: {
    story: "A user profile service stores profile updates on the `user-profiles` topic using userId as the message key. Every time a user edits their profile, a new message is appended. Over six months of operation, the topic has accumulated up to 50 versions of each user's profile — but only the latest version is ever needed. Broker disk usage has climbed to 92% and is still growing. At 100% the brokers will start rejecting writes entirely.",
    symptom: "Broker disk usage is at 92% and climbing. Hundreds of stale profile versions per key are retained indefinitely. The `user-profiles` topic uses cleanup.policy=delete with a 7-day retention window, meaning old versions accumulate until the entire segment expires — never removing superseded keys.",
    goal: "Switch cleanup.policy to 'compact' on the user-profiles topic so Kafka retains only the latest value per key. Reduce retention.bytes to cap total topic disk usage. Bring broker disk utilisation back to safe levels and restore system health above 75%.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Log compaction works differently from time/size-based retention. Instead of deleting entire segments after a time period, compaction scans the log and removes all but the latest message for each key. Switch cleanup.policy to 'compact' — the compaction thread will then deduplicate by key on its next pass.",
        relatedConcept: 'log-compaction',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Compaction alone won't cap disk usage — it only removes duplicate keys. Set retention.bytes to a hard limit (e.g. 10 GB per partition) so Kafka also drops the oldest compacted segments when the topic exceeds that size. Combine both policies if needed: cleanup.policy=compact,delete.",
        relatedConcept: 'retention-bytes',
        highlightElements: ['topic-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [
      { id: 0, diskCapacityBytes: 107_374_182_400 }, // 100 GB
      { id: 1, diskCapacityBytes: 107_374_182_400 },
      { id: 2, diskCapacityBytes: 107_374_182_400 },
    ],
    topics: [
      {
        name: 'user-profiles',
        partitionCount: 6,
        replicationFactor: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days — wrong policy for KV data
        retentionBytes: -1,                     // BUG: no size cap
        cleanupPolicy: 'delete',               // BUG: should be compact
        minInsyncReplicas: 2,
        messageMaxBytes: 1_048_576,
      },
    ],
    producers: [
      {
        id: 'producer-profile-service',
        targetTopic: 'user-profiles',
        messagesPerSecond: 40,
        acks: -1,
        keyStrategy: 'fixed',     // userId as key — same keys update repeatedly
        fixedKey: 'user-key',
        messageSizeBytes: 2_048,
      },
    ],
    consumers: [
      {
        id: 'consumer-profile-reader',
        groupId: 'profile-reader-group',
        subscribedTopics: ['user-profiles'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 25,
      },
      {
        id: 'consumer-profile-cache',
        groupId: 'profile-cache-group',
        subscribedTopics: ['user-profiles'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: true,
        maxPollRecords: 100,
        processingTimeMs: 40,
      },
    ],
  },

  failureScript: [
    {
      atTick: 30,
      type: 'retention-overflow',
      target: 'broker-0',
      params: { diskUsagePercent: 0.98 },
    },
  ],

  victoryConditions: [
    {
      id: 'compaction-enabled',
      description: "cleanup.policy is 'compact' on user-profiles",
      required: true,
      check: s => s.topics.get('user-profiles')?.config.cleanupPolicy === 'compact',
    },
    {
      id: 'retention-capped',
      description: 'retention.bytes set to a positive limit on user-profiles',
      required: false,
      check: s => {
        const retentionBytes = s.topics.get('user-profiles')?.config.retentionBytes ?? -1
        return retentionBytes > 0
      },
    },
    {
      id: 'health-restored',
      description: 'System health above 75%',
      required: true,
      check: s => s.systemHealthScore > 75,
    },
  ],

  conceptCards: [
    {
      concept: 'log-compaction',
      title: 'Log Compaction',
      body: "Log compaction tells Kafka to retain only the latest message for each unique key, rather than expiring whole segments by time or size. This makes a Kafka topic behave like a changelog table — perfect for user profiles, configuration records, or any dataset where earlier versions are obsolete. Tombstone messages (null value) are used to signal key deletion.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-cleanup-policy', 'set-retention-ms', 'set-retention-bytes', 'set-min-isr'],
}

export default scenario
