import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'kafka-connect-jdbc-sink',
  index: 24,
  title: 'Kafka Connect — JDBC Sink Failure',
  subtitle: 'Hard · Kafka Connect & Error Tolerance',
  difficulty: 'hard',
  estimatedMinutes: 17,
  coverConcepts: ['kafka-connect', 'dlq', 'error-handling', 'retry-logic'],
  maxLagForHealth: 350,

  briefing: {
    story: "An order pipeline writes every order event from Kafka to a PostgreSQL database using a JDBC Sink connector. The database had a 5-minute maintenance window overnight. During that window, the connector attempted writes, received connection errors, and eventually transitioned to FAILED state. Now the connector is stopped, the consumer group 'connect-jdbc-sink' has accumulated 30,000 messages of lag, and the database has gaps in order records. Retry logic is misconfigured — errors.tolerance is set to 'none', meaning any single bad record (e.g. a null primary key) permanently halts the connector.",
    symptom: "The JDBC Sink connector is in FAILED state. Consumer group 'connect-jdbc-sink' shows 30,000 messages of lag. Order records have gaps in the database. Any malformed order event immediately kills the connector, requiring manual intervention each time.",
    goal: "Restart the connector consumer group by resetting its offset. Configure a Dead Letter Queue (DLQ) topic so bad records are routed to 'orders-dlq' instead of failing the connector. Set max.poll.records higher to drain the backlog faster. Bring consumer lag below 500.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The connector's consumer group has fallen 30,000 messages behind. Before fixing error tolerance, reset the consumer group offset to the earliest available position so the connector can replay the messages it missed during the database outage. Use reset-consumer-group-offset targeting 'connect-jdbc-sink'.",
        relatedConcept: 'error-handling',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "With errors.tolerance=none (the default), any single record that the sink cannot process — a constraint violation, a null key, a type mismatch — crashes the entire connector. Enable a Dead Letter Queue by adding a DLQ target topic (e.g. 'orders-dlq'). Bad records will be forwarded there with error metadata headers, and the connector will continue processing the rest of the stream.",
        relatedConcept: 'dlq',
        highlightElements: ['connector-config-panel'],
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
        name: 'orders',
        partitionCount: 6,
        replicationFactor: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 2,
        messageMaxBytes: 1_048_576,
      },
      {
        name: 'orders-dlq',
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
        id: 'producer-order-service',
        targetTopic: 'orders',
        messagesPerSecond: 45,
        acks: -1,
        keyStrategy: 'random',
        messageSizeBytes: 768,
        retries: 3,
        retryBackoffMs: 500,
      },
    ],
    consumers: [
      {
        id: 'consumer-jdbc-sink',
        groupId: 'connect-jdbc-sink',
        subscribedTopics: ['orders'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: false,   // connector manages offsets manually after commit to DB
        maxPollRecords: 50,         // BUG: too low — slow drain of 30K backlog
        processingTimeMs: 80,       // simulate DB insert latency
        errorRate: 0.05,            // BUG: some records are malformed, crashing connector
        dlqEnabled: false,          // BUG: no DLQ, single bad record kills connector
        maxRetries: 0,              // BUG: no retries configured
      },
      {
        id: 'consumer-order-notifications',
        groupId: 'order-notifications-group',
        subscribedTopics: ['orders'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 30,
      },
    ],
  },

  failureScript: [
    {
      atTick: 30,
      type: 'consumer-crash',
      target: 'consumer-jdbc-sink',
      params: { reason: 'jdbc-connector-failed', lagOnCrash: 30000 },
    },
  ],

  victoryConditions: [
    {
      id: 'lag-drained',
      description: 'JDBC sink consumer lag below 500',
      required: true,
      check: s => (s.consumers.get('consumer-jdbc-sink')?.lag ?? 99999) < 500,
    },
    {
      id: 'dlq-enabled',
      description: 'Dead Letter Queue enabled on JDBC sink consumer',
      required: true,
      check: s => s.consumers.get('consumer-jdbc-sink')?.config.dlqEnabled === true,
    },
    {
      id: 'health-restored',
      description: 'System health above 80%',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'kafka-connect',
      title: 'Kafka Connect Error Handling',
      body: "Kafka Connect sink connectors support configurable error tolerance via errors.tolerance (none|all) and Dead Letter Queues (DLQ). With errors.tolerance=all and a DLQ topic configured, bad records are forwarded to the DLQ with error metadata headers rather than crashing the connector. This is critical for production pipelines where occasional malformed records are inevitable.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['add-dlq', 'configure-retry', 'set-max-poll-records', 'reset-consumer-group-offset'],
}

export default scenario
