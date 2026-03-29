import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'quota-throttling',
  index: 23,
  title: 'Quota Throttling Crisis',
  subtitle: 'Hard · Quotas & Multi-Tenant Clusters',
  difficulty: 'hard',
  estimatedMinutes: 15,
  coverConcepts: ['retention-bytes', 'retention-time', 'isr'],
  maxLagForHealth: 200,

  briefing: {
    story: "A multi-tenant Kafka cluster serves two very different workloads: a low-priority analytics pipeline that does bulk historical data replays, and a high-priority payment service that processes live transactions. The analytics team kicks off a full replay — producing at 500 MB/s — which saturates broker network bandwidth. Kafka's broker-level throttling then applies to ALL producers equally, choking the payment producer down to near-zero throughput. Payments are timing out.",
    symptom: "The payment producer's throughput has dropped to less than 5% of normal. Broker network utilisation is at 100%, pinned by the analytics bulk replay. Both producers are competing for the same network quota without any client-level differentiation. Payment transaction failures are climbing.",
    goal: "Configure per-client-id byte-rate quotas to isolate the analytics producer from the payment producer. Cap the analytics producer at 50 MB/s to free broker network headroom. Ensure the payment producer maintains sufficient throughput. Bring the payment failure rate back to zero.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Kafka supports per-client-id producer byte-rate quotas enforced at the broker level. Without quotas, any producer can consume unlimited bandwidth and starve its neighbours. The payment producer and analytics producer need separate quota buckets so one cannot impact the other.",
        relatedConcept: 'retention-bytes',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Use the set-quota action to assign a producer-byte-rate quota to 'producer-analytics' (cap it at ~50 MB/s = 52,428,800 bytes/s). Also tune linger.ms on the analytics producer to increase batch efficiency — larger batches mean fewer broker round trips, reducing the quota pressure at the same message throughput.",
        relatedConcept: 'retention-time',
        highlightElements: ['producer-config-panel'],
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
        name: 'payment-events',
        partitionCount: 6,
        replicationFactor: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 2,
        messageMaxBytes: 1_048_576,
      },
      {
        name: 'analytics-events',
        partitionCount: 12,
        replicationFactor: 2,
        retentionMs: 30 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
    ],
    producers: [
      {
        id: 'producer-payment',
        targetTopic: 'payment-events',
        messagesPerSecond: 60,
        acks: -1,
        keyStrategy: 'random',
        messageSizeBytes: 1_024,
        lingerMs: 5,
      },
      {
        id: 'producer-analytics',
        targetTopic: 'analytics-events',
        messagesPerSecond: 500,   // BUG: bulk replay saturating broker bandwidth
        acks: 1,
        keyStrategy: 'round-robin',
        messageSizeBytes: 4_096,
        lingerMs: 0,              // BUG: no batching, hammering broker with small requests
        batchSizeBytes: 16_384,
      },
    ],
    consumers: [
      {
        id: 'consumer-payment-processor',
        groupId: 'payment-processor-group',
        subscribedTopics: ['payment-events'],
        autoOffsetReset: 'latest',
        enableAutoCommit: false,
        maxPollRecords: 100,
        processingTimeMs: 20,
        isolationLevel: 'read_committed',
      },
      {
        id: 'consumer-analytics-pipeline',
        groupId: 'analytics-pipeline-group',
        subscribedTopics: ['analytics-events'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: true,
        maxPollRecords: 500,
        processingTimeMs: 50,
      },
    ],
  },

  failureScript: [
    {
      atTick: 25,
      type: 'consumer-lag-spike',
      target: 'consumer-payment-processor',
      params: { reason: 'producer-throttled-by-quota', producerRateMultiplier: 0.05 },
    },
  ],

  victoryConditions: [
    {
      id: 'payment-not-failing',
      description: 'Payment producer has zero failed sends',
      required: true,
      check: s => (s.producers.get('producer-payment')?.totalFailed ?? 1) === 0,
    },
    {
      id: 'payment-lag-ok',
      description: 'Payment consumer lag below 50',
      required: true,
      check: s => (s.consumers.get('consumer-payment-processor')?.lag ?? 9999) < 50,
    },
    {
      id: 'health-restored',
      description: 'System health above 85%',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'retention-bytes',
      title: 'Kafka Client Quotas',
      body: "Kafka enforces per-client-id (and per-user) byte-rate quotas at the broker level. When a producer exceeds its quota, the broker throttles the client by delaying responses — this prevents noisy neighbours from starving other tenants. Setting producer-byte-rate and consumer-byte-rate quotas per client is essential in any multi-team or multi-workload Kafka cluster.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-producer-acks', 'set-linger-ms', 'set-retention-bytes', 'set-min-isr'],
}

export default scenario
