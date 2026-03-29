import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'debezium-cdc-source',
  index: 25,
  title: 'Debezium CDC Offset Mismatch',
  subtitle: 'Hard · CDC & Idempotent Producers',
  difficulty: 'hard',
  estimatedMinutes: 20,
  coverConcepts: ['kafka-connect', 'idempotent-producer', 'offset-reset', 'error-handling'],
  maxLagForHealth: 300,

  briefing: {
    story: "A Debezium connector captures row-level changes from a MySQL 'orders' database and publishes them to the 'db.orders' Kafka topic. During a routine MySQL failover to a read replica, the replica's binary log (binlog) position was slightly ahead of where the primary had last checkpointed. Debezium resumed from the stored offset (pointing to the old primary's binlog coordinates), which no longer map correctly to the replica's binlog. The result: Debezium is replaying hundreds of order events that were already published. Downstream consumers are processing the same orders two or three times, triggering duplicate fulfilment requests.",
    symptom: "A massive spike in duplicate order events on the 'db.orders' topic. The downstream order-processor consumer group is receiving 10x normal message volume. The deduplication service is overwhelmed and falling behind. Duplicate fulfilment requests are reaching the warehouse.",
    goal: "Enable idempotent production on the Debezium bridge producer so Kafka rejects broker-level duplicates. Set read_committed isolation on the order-processor consumer to ignore uncommitted/in-flight duplicates. Reset the consumer group offset to skip the duplicate replay window. Achieve zero new duplicates for a sustained period and drain the consumer lag.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Debezium's stored binlog offset is now misaligned with the MySQL replica. The connector is replaying events that were already committed to Kafka. Enable idempotent producer mode on 'producer-debezium' — Kafka assigns each message a producer epoch and sequence number, allowing brokers to detect and drop exact duplicates at the broker level.",
        relatedConcept: 'idempotent-producer',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Even with idempotent production, the consumer group 'order-processor' has already consumed the duplicate window. Reset its offset to the end of the duplicate region (use reset-consumer-group-offset). Then switch consumer isolation to read_committed so in-flight transactional duplicates are not exposed to the application.",
        relatedConcept: 'offset-reset',
        highlightElements: ['producer-config-panel', 'consumer-config-panel'],
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
        name: 'db.orders',
        partitionCount: 6,
        replicationFactor: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 2,
        messageMaxBytes: 1_048_576,
      },
      {
        name: 'db.orders.dlq',
        partitionCount: 3,
        replicationFactor: 2,
        retentionMs: 14 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
    ],
    producers: [
      {
        id: 'producer-debezium',
        targetTopic: 'db.orders',
        messagesPerSecond: 35,
        acks: -1,
        idempotent: false,          // BUG: idempotence disabled — broker cannot deduplicate retries
        keyStrategy: 'fixed',       // row primary key as message key
        fixedKey: 'order-id',
        messageSizeBytes: 1_024,
        retries: 5,
        retryBackoffMs: 1000,
      },
    ],
    consumers: [
      {
        id: 'consumer-order-processor',
        groupId: 'order-processor',
        subscribedTopics: ['db.orders'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: false,
        maxPollRecords: 150,
        processingTimeMs: 45,
        isolationLevel: 'read_uncommitted',  // BUG: reads duplicates before they are deduplicated
        dlqEnabled: true,
        maxRetries: 3,
      },
      {
        id: 'consumer-order-audit',
        groupId: 'order-audit-group',
        subscribedTopics: ['db.orders'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 20,
        isolationLevel: 'read_uncommitted',
      },
    ],
  },

  failureScript: [
    {
      atTick: 35,
      type: 'duplicate-messages',
      target: 'producer-debezium',
      params: { reason: 'binlog-offset-mismatch', duplicateMultiplier: 10 },
    },
  ],

  victoryConditions: [
    {
      id: 'no-new-duplicates',
      description: 'Debezium producer duplicate count is zero',
      required: true,
      check: s => (s.producers.get('producer-debezium')?.totalDuplicates ?? 1) === 0,
    },
    {
      id: 'idempotence-enabled',
      description: 'Idempotent production enabled on producer-debezium',
      required: true,
      check: s => s.producers.get('producer-debezium')?.config.idempotent === true,
    },
    {
      id: 'lag-drained',
      description: 'Total consumer lag below 100',
      required: true,
      check: s => s.metrics.totalLag < 100,
    },
    {
      id: 'health-restored',
      description: 'System health above 75%',
      required: false,
      check: s => s.systemHealthScore > 75,
    },
  ],

  conceptCards: [
    {
      concept: 'idempotent-producer',
      title: 'Idempotent Producers & CDC',
      body: "An idempotent Kafka producer assigns a unique producer epoch and per-partition sequence number to every message. If a network retry causes a duplicate send, the broker detects the repeated sequence number and silently discards the duplicate — guaranteeing exactly-once delivery at the broker level. For CDC pipelines (Debezium, Kafka Connect source connectors), idempotent production is essential when the source system can replay events after a failover.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['enable-idempotence', 'set-offset-reset', 'set-isolation-level', 'reset-consumer-group-offset', 'configure-retry'],
}

export default scenario
