import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'supply-chain',
  index: 13,
  title: 'Supply Chain Event Tracker',
  subtitle: 'Medium-Hard · Transactional Read-Process-Write',
  difficulty: 'medium-hard',
  estimatedMinutes: 15,
  coverConcepts: ['transaction', 'read-process-write', 'isolation-level', 'exactly-once'],
  maxLagForHealth: 200,

  briefing: {
    story: "LogiFlow's tracking service consumes from 'shipment-events' and produces to 'warehouse-updates'. A network partition caused the consumer to crash after consuming a batch but before producing the warehouse update — those shipments are now silently lost. Warehouse staff can't locate hundreds of packages.",
    symptom: "Ghost shipments: consumed from source topic but never written to warehouse-updates. Silent data loss in the pipeline.",
    goal: "Wrap the consume+produce in a Kafka transaction. Set isolation.level=read_committed on the downstream consumer.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The consumer-as-producer pattern (read from topic A, write to topic B) has a window where the consumer committed its offset but the producer write failed. Those messages are silently dropped.",
        relatedConcept: 'read-process-write',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Enable transactions on the warehouse producer with a transactionalId. The transaction atomically commits both the consumer offset and the producer write — either both happen or neither does.",
        relatedConcept: 'transaction',
        highlightElements: ['producer-warehouse-config'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [
      {
        name: 'shipment-events',
        partitionCount: 3,
        replicationFactor: 1,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
      {
        name: 'warehouse-updates',
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
        id: 'producer-logistics',
        targetTopic: 'shipment-events',
        messagesPerSecond: 12,
        acks: 1,
        keyStrategy: 'random',
      },
      {
        id: 'producer-warehouse',
        targetTopic: 'warehouse-updates',
        messagesPerSecond: 0,
        acks: 1,
        transactional: false,  // BUG: not transactional
        keyStrategy: 'random',
      },
    ],
    consumers: [
      {
        id: 'consumer-tracker',
        groupId: 'tracker-group',
        subscribedTopics: ['shipment-events'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: true,
        maxPollRecords: 50,
        processingTimeMs: 30,
        errorRate: 0.05,
        isolationLevel: 'read_uncommitted',
      },
      {
        id: 'consumer-warehouse',
        groupId: 'warehouse-group',
        subscribedTopics: ['warehouse-updates'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: true,
        maxPollRecords: 100,
        processingTimeMs: 20,
        isolationLevel: 'read_uncommitted', // BUG: should be read_committed
      },
    ],
  },

  failureScript: [
    { atTick: 20, type: 'consumer-crash', target: 'consumer-tracker', params: {} },
  ],

  victoryConditions: [
    {
      id: 'transactional',
      description: 'Warehouse producer has transactions enabled',
      required: true,
      check: s => s.producers.get('producer-warehouse')?.config.transactional === true,
    },
    {
      id: 'isolation-committed',
      description: 'Warehouse consumer uses read_committed',
      required: true,
      check: s => s.consumers.get('consumer-warehouse')?.config.isolationLevel === 'read_committed',
    },
  ],

  conceptCards: [
    {
      concept: 'read-process-write',
      title: 'Read-Process-Write Pattern',
      body: "When a service consumes from one Kafka topic and produces to another, it creates a read-process-write pipeline. Without transactions, a crash between the consume and produce creates a gap — messages are consumed but never forwarded. Kafka transactions solve this atomically.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['enable-transactions', 'set-isolation-level'],
}

export default scenario
