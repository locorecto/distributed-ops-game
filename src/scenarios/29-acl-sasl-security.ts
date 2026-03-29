import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'acl-sasl-security',
  index: 29,
  title: 'ACL & SASL Security Incident',
  subtitle: 'Expert · Authorization & Access Control',
  difficulty: 'expert',
  estimatedMinutes: 16,
  coverConcepts: ['error-handling', 'retry-logic', 'dlq', 'at-least-once'],
  maxLagForHealth: 200,

  briefing: {
    story: "The payments cluster was migrated to SASL/PLAIN authentication last night. The migration script that imported ACL rules contained a typo: it denied READ on the 'payment-events' topic to the 'payment-processor' consumer group instead of granting it. The `payment-producer` also has no WRITE ACL. The payment-processor group started receiving AUTHORIZATION_FAILED errors at 02:14 AM and has been unable to consume since. Payments are stacking up with no processing — the backlog is growing at 500 messages per second.",
    symptom: "The payment-processor consumer group is receiving AUTHORIZATION_FAILED errors on every poll attempt and crashing. Consumer lag is growing at 500 msg/s with no signs of stopping. The payment-producer is also being rejected when attempting to write new payment events. All payment processing is halted.",
    goal: "Grant READ permission on the 'payment-events' topic to the 'payment-processor' consumer group. Grant WRITE permission on 'payment-events' to the 'payment-producer'. Once permissions are restored, reset the consumer group offset to the point of failure to process all backed-up payments. Verify error rate clears and lag drains.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Kafka ACLs are evaluated per principal (SASL user or certificate DN). A DENY rule always overrides an ALLOW rule. The payment-processor group's SASL principal needs an explicit ALLOW for the READ operation on the 'payment-events' topic AND on the consumer group resource itself. Both topic-level and group-level ACLs are required for a consumer to function.",
        relatedConcept: 'error-handling',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "After fixing ACL permissions, the consumer group will resume from its last committed offset. But because it was crashed during the outage, some messages may have been received but not committed. Use 'reset-consumer-group-offset' to reset to the earliest uncommitted offset and replay any messages that may have been lost. Also configure retries on the producer to handle any transient auth errors during the permission propagation window.",
        relatedConcept: 'retry-logic',
        highlightElements: ['consumer-group-panel', 'acl-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }, { id: 1 }, { id: 2 }],
    topics: [{
      name: 'payment-events',
      partitionCount: 6,
      replicationFactor: 3,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 2,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'payment-producer',
      targetTopic: 'payment-events',
      messagesPerSecond: 30,
      acks: -1,
      keyStrategy: 'fixed',
      fixedKey: 'payment',
      retries: 0,         // BUG: no retries — auth errors immediately fatal
    }],
    consumers: [
      {
        id: 'consumer-payment-processor',
        groupId: 'payment-processor',
        subscribedTopics: ['payment-events'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: false,
        maxPollRecords: 100,
        processingTimeMs: 40,
        sessionTimeoutMs: 30000,
        errorRate: 1.0,   // BUG: 100% error rate — AUTHORIZATION_FAILED on every poll
        dlqEnabled: false,
        maxRetries: 0,
      },
    ],
  },

  failureScript: [
    {
      atTick: 10,
      type: 'consumer-crash',
      target: 'consumer-payment-processor',
      params: { reason: 'AUTHORIZATION_FAILED', acl: 'READ-DENIED' },
    },
  ],

  victoryConditions: [
    {
      id: 'error-rate-cleared',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'lag-drained',
      description: 'Total consumer lag below 200',
      required: true,
      check: s => s.metrics.totalLag < 200,
    },
    {
      id: 'health-restored',
      description: 'System health score above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'error-handling',
      title: 'Kafka ACL & SASL Security',
      body: "Kafka ACLs control access by principal (SASL user, mTLS certificate DN) to resources (topics, consumer groups, cluster). Consumers need READ on the topic AND READ on the group resource. Producers need WRITE on the topic. A DENY rule always wins over an ALLOW. After a SASL migration, validate ACLs with kafka-acls.sh --list before cutting over traffic to catch misconfigurations before they cause outages.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-producer-acks', 'configure-retry', 'add-dlq', 'reset-consumer-group-offset'],
}

export default scenario
