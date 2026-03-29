import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'multi-tenant-cluster',
  index: 30,
  title: 'Multi-Tenant Cluster Isolation',
  subtitle: 'Master · Quotas & Bandwidth Throttling',
  difficulty: 'master',
  estimatedMinutes: 25,
  coverConcepts: ['batching', 'compression', 'linger-ms', 'batch-size'],
  maxLagForHealth: 200,

  briefing: {
    story: "A shared Kafka cluster serves 8 engineering teams. This morning, the ML training team kicked off a massive monthly model retraining job using 'ml-batch-producer' — pushing 2GB/s of feature vectors into the cluster with no throughput limits. The cluster has no client-level quotas configured. All available broker bandwidth is consumed by the ML job, causing latency spikes for the payments team (100ms SLA) and the real-time analytics team (sub-100ms SLA). Payment produce latency has reached 3000ms; analytics throughput has dropped by 90%.",
    symptom: "Payment topic produce latency is 3000ms against a 100ms SLA. Analytics pipeline throughput dropped 90% — dashboards are showing stale data. The ml-batch-producer is consuming 100% of cluster I/O and bandwidth. Both the payments team and analytics team are violating their SLAs. The SRE team is getting paged.",
    goal: "Implement per-client-id quotas to isolate the ML batch job from critical real-time workloads. Throttle ml-batch-producer to a 100MB/s produce quota. Give payment-producer a reserved 500MB/s quota to guarantee its SLA. Cap the ml-batch consumer at 200MB/s fetch quota. Use compression (lz4) and larger batch sizes on the ML producer to improve efficiency at the lower quota.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Kafka supports quotas per client-id at the producer and consumer level. Set a produce byte rate quota on 'ml-batch-producer' using 'set-quota' to throttle it to 100MB/s. Quotas are enforced by the broker using a sliding window — clients that exceed their quota are throttled by introducing artificial delays in broker responses. This frees up bandwidth for payment-producer without requiring any client-side changes.",
        relatedConcept: 'batching',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "At a lower produce quota, the ML batch job can improve efficiency by batching more aggressively. Increase linger.ms to 100ms and batch.size to 1MB on ml-batch-producer — this amortizes overhead across more messages per quota window, achieving better throughput within the limit. Enable lz4 compression to further reduce bytes-on-wire, effectively getting more messages through the 100MB/s quota.",
        relatedConcept: 'compression',
        highlightElements: ['producer-panel', 'quota-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [
      { id: 0, diskCapacityBytes: 500_000_000_000 },
      { id: 1, diskCapacityBytes: 500_000_000_000 },
      { id: 2, diskCapacityBytes: 500_000_000_000 },
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
        name: 'analytics-stream',
        partitionCount: 8,
        replicationFactor: 3,
        retentionMs: 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 2,
        messageMaxBytes: 1_048_576,
      },
      {
        name: 'ml-training-features',
        partitionCount: 12,
        replicationFactor: 2,
        retentionMs: 3 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 10_485_760,
      },
    ],
    producers: [
      {
        id: 'payment-producer',
        targetTopic: 'payment-events',
        messagesPerSecond: 30,
        acks: -1,
        keyStrategy: 'fixed',
        fixedKey: 'payment',
        batchSizeBytes: 16_384,
        lingerMs: 5,
      },
      {
        id: 'analytics-producer',
        targetTopic: 'analytics-stream',
        messagesPerSecond: 80,
        acks: 1,
        keyStrategy: 'random',
        batchSizeBytes: 65_536,
        lingerMs: 20,
      },
      {
        id: 'ml-batch-producer',
        targetTopic: 'ml-training-features',
        messagesPerSecond: 5000,  // BUG: unconstrained batch job — 2GB/s saturating cluster
        acks: 1,
        keyStrategy: 'round-robin',
        batchSizeBytes: 65_536,   // BUG: small batches → high overhead
        lingerMs: 0,              // BUG: no linger → maximum overhead, minimum efficiency
        compressionType: 'none',  // BUG: no compression → full bytes-on-wire
        messageSizeBytes: 409_600,
      },
    ],
    consumers: [
      {
        id: 'consumer-payment-validator',
        groupId: 'payment-validator-group',
        subscribedTopics: ['payment-events'],
        autoOffsetReset: 'latest',
        enableAutoCommit: false,
        maxPollRecords: 100,
        processingTimeMs: 30,
        sessionTimeoutMs: 30000,
      },
      {
        id: 'consumer-analytics-dashboard',
        groupId: 'analytics-dashboard-group',
        subscribedTopics: ['analytics-stream'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 500,
        processingTimeMs: 10,
      },
      {
        id: 'consumer-ml-trainer',
        groupId: 'ml-trainer-group',
        subscribedTopics: ['ml-training-features'],
        autoOffsetReset: 'earliest',
        enableAutoCommit: true,
        maxPollRecords: 1000,
        processingTimeMs: 5,
        fetchMaxBytes: 524_288_000, // BUG: 500MB fetch max — consuming all broker read bandwidth
      },
    ],
  },

  failureScript: [
    {
      atTick: 20,
      type: 'sla-breach',
      target: 'payment-producer',
      params: { reason: 'bandwidth-starvation', latencyMs: 3000, slaMs: 100 },
    },
    {
      atTick: 22,
      type: 'consumer-slow',
      target: 'consumer-analytics-dashboard',
      params: { reason: 'broker-io-saturation', throughputDropPercent: 90 },
    },
  ],

  victoryConditions: [
    {
      id: 'payment-healthy',
      description: 'Payment producer error rate below 5%',
      required: true,
      check: s => {
        const p = s.producers.get('payment-producer')
        return p !== undefined && p.errorRate < 0.05
      },
    },
    {
      id: 'error-rate-ok',
      description: 'Overall error rate below 5%',
      required: true,
      check: s => s.metrics.errorRate < 0.05,
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
      concept: 'batching',
      title: 'Kafka Client Quotas',
      body: "Kafka brokers enforce per-client-id (or per-user) quotas on produce byte rate, consume byte rate, and request rate. When a client exceeds its quota, the broker throttles it by delaying responses — the client backs off naturally without being disconnected. Quotas are configured via kafka-configs.sh or the AdminClient API and take effect immediately without restarting brokers or clients.",
      showWhenFixed: true,
    },
    {
      concept: 'compression',
      title: 'Multi-Tenant Cluster Best Practices',
      body: "Shared Kafka clusters require quotas, topic-level isolation, and capacity planning per team. Assign client-ids per service and enforce produce/fetch quotas. Use compression (lz4 or zstd) and larger batch sizes for bulk jobs to reduce bytes-on-wire within quota limits. Separate critical low-latency topics onto dedicated partitions with higher replication, and use min.insync.replicas=2 to prevent noisy-neighbor scenarios from degrading durability.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-quota' as never, 'set-producer-acks', 'set-linger-ms', 'set-batch-size', 'set-compression', 'set-fetch-config'],
}

export default scenario
