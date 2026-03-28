import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'iot-sensors',
  index: 5,
  title: 'IoT Sensor Data Pipeline',
  subtitle: 'Medium · Batching & Compression',
  difficulty: 'medium',
  estimatedMinutes: 10,
  coverConcepts: ['batching', 'compression', 'linger-ms', 'batch-size'],
  maxLagForHealth: 600,

  briefing: {
    story: "SmartFactory has 2,000 temperature sensors sending readings every second. Each message is tiny (~50 bytes) but there are millions of them. The broker is overwhelmed by the sheer number of tiny network requests — throughput is 10× below target and broker CPU is spiking.",
    symptom: "Broker CPU is very high, throughput is far below the expected 2,000 msg/sec. Too many tiny individual network requests.",
    goal: "Increase effective throughput above 1,500 msg/sec by tuning linger.ms, batch.size, and enabling snappy compression.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "When linger.ms=0, the producer sends each message immediately as a separate network request. Increase linger.ms to 20ms so the producer waits and batches messages together before sending.",
        relatedConcept: 'linger-ms',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Increase batch.size from 16KB to 256KB. Larger batches mean fewer network round trips. Also enable compression.type=snappy to reduce bandwidth by ~50%.",
        relatedConcept: 'compression',
        highlightElements: ['producer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'sensor-readings',
      partitionCount: 4,
      replicationFactor: 1,
      retentionMs: 60 * 60 * 1000,
      retentionBytes: 500 * 1024 * 1024,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-sensors',
      targetTopic: 'sensor-readings',
      messagesPerSecond: 200,
      acks: 1,
      keyStrategy: 'random',
      messageSizeBytes: 50,
      lingerMs: 0,        // BUG: no batching
      batchSizeBytes: 16384,
      compressionType: 'none',
    }],
    consumers: [{
      id: 'consumer-analytics',
      groupId: 'analytics-group',
      subscribedTopics: ['sensor-readings'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,
      maxPollRecords: 500,
      processingTimeMs: 5,
      sessionTimeoutMs: 30000,
      heartbeatIntervalMs: 10000,
    }],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'throughput-ok',
      description: 'Messages/sec above 150 (proxy for batching efficiency)',
      required: true,
      check: s => s.metrics.messagesPerSecIn > 150,
    },
    {
      id: 'lag-low',
      description: 'Consumer lag below 200',
      required: true,
      check: s => s.metrics.totalLag < 200,
    },
  ],

  conceptCards: [
    {
      concept: 'batching',
      title: 'Producer Batching',
      body: "The producer accumulates messages in memory before sending them as a batch. linger.ms controls how long to wait for the batch to fill up. batch.size is the maximum batch size in bytes. Larger batches = fewer network requests = higher throughput.",
      showWhenFixed: true,
    },
    {
      concept: 'compression',
      title: 'Message Compression',
      body: "Kafka supports snappy, gzip, lz4, and zstd compression. Compression is applied at the batch level — larger batches compress better. Snappy offers a good balance of CPU cost and compression ratio (~50% smaller).",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-linger-ms', 'set-batch-size', 'set-compression'],
}

export default scenario
