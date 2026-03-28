import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'ecommerce-pipeline',
  index: 9,
  title: 'E-Commerce Order Pipeline',
  subtitle: 'Medium · Transactions & Read-Process-Write',
  difficulty: 'medium',
  estimatedMinutes: 12,
  coverConcepts: ['transaction', 'read-process-write', 'exactly-once', 'isolation-level'],
  maxLagForHealth: 200,

  briefing: {
    story: "ShopAll's order service reads from 'orders' and writes confirmation events to 'order-confirmations'. After a deployment, a consumer crashed mid-processing. On restart, the same orders were re-read and re-confirmed — customers got 2–3 confirmation emails each. The support queue is exploding.",
    symptom: "Duplicate order confirmations sent. Consumer crash caused re-processing of already-handled orders.",
    goal: "Enable transactional producer and set isolation.level=read_committed to achieve exactly-once read-process-write semantics.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The consumer reads an order, processes it, and the producer writes a confirmation. Without transactions, if the consumer crashes after producing but before committing its offset, the order gets processed again on restart.",
        relatedConcept: 'read-process-write',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Enable 'Transactions' on the producer (transactional.id must be set). Then set the consumer's isolation.level to 'read_committed' so it only sees messages from committed transactions — this prevents reading partially written data.",
        relatedConcept: 'transaction',
        highlightElements: ['producer-config-panel', 'consumer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [
      {
        name: 'orders',
        partitionCount: 3,
        replicationFactor: 1,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
      {
        name: 'order-confirmations',
        partitionCount: 3,
        replicationFactor: 1,
        retentionMs: 30 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
    ],
    producers: [
      {
        id: 'producer-storefront',
        targetTopic: 'orders',
        messagesPerSecond: 15,
        acks: 1,
        keyStrategy: 'random',
      },
      {
        id: 'producer-confirmation',
        targetTopic: 'order-confirmations',
        messagesPerSecond: 0, // driven by consumer
        acks: 1,
        idempotent: false,   // BUG: not transactional
        transactional: false,
        keyStrategy: 'random',
      },
    ],
    consumers: [{
      id: 'consumer-order-processor',
      groupId: 'order-processing-group',
      subscribedTopics: ['orders'],
      autoOffsetReset: 'earliest',
      enableAutoCommit: true,
      maxPollRecords: 50,
      processingTimeMs: 30,
      errorRate: 0.05, // 5% failure rate → causes reprocessing
      isolationLevel: 'read_uncommitted',
    }],
  },

  failureScript: [
    { atTick: 25, type: 'consumer-crash', target: 'consumer-order-processor', params: {} },
  ],

  victoryConditions: [
    {
      id: 'transactional-enabled',
      description: 'Transactional producer enabled',
      required: true,
      check: s => {
        const prod = s.producers.get('producer-confirmation')
        return prod?.config.transactional === true
      },
    },
    {
      id: 'isolation-committed',
      description: 'Consumer isolation.level = read_committed',
      required: true,
      check: s => {
        const c = s.consumers.get('consumer-order-processor')
        return c?.config.isolationLevel === 'read_committed'
      },
    },
    { id: 'lag-ok', description: 'Consumer lag below 100', required: false, check: s => s.metrics.totalLag < 100 },
  ],

  conceptCards: [
    {
      concept: 'transaction',
      title: 'Kafka Transactions',
      body: "Kafka transactions allow atomic writes across multiple partitions or topics. A transactional producer wraps produce calls in begin/commit blocks. If the producer crashes, the transaction is aborted and consumers with read_committed isolation never see the partial data.",
      showWhenFixed: true,
    },
    {
      concept: 'isolation-level',
      title: 'Isolation Level',
      body: "read_uncommitted (default) exposes all messages including those from aborted transactions. read_committed only exposes messages from successfully committed transactions — essential for exactly-once read-process-write pipelines.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['enable-transactions', 'set-isolation-level', 'enable-idempotence'],
}

export default scenario
