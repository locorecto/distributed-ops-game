import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'video-streaming',
  index: 12,
  title: 'Video Streaming Platform',
  subtitle: 'Medium-Hard · Large Messages & Fetch Tuning',
  difficulty: 'medium-hard',
  estimatedMinutes: 12,
  coverConcepts: ['message-size', 'fetch-config', 'large-messages', 'compression'],
  maxLagForHealth: 200,

  briefing: {
    story: "StreamVid stores video thumbnail metadata including base64-encoded preview images (~480KB per message) in Kafka. The pipeline suddenly started failing — producers are throwing RecordTooLargeException and consumers fail to fetch oversized messages.",
    symptom: "RecordTooLargeException on the producer. Consumers can't fetch messages. All video upload confirmations are failing.",
    goal: "Increase message.max.bytes on the topic, max.request.size on the producer, and fetch.max.bytes on the consumer. Enable lz4 compression to reduce wire size.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "The default max message size is 1MB. Your thumbnail messages are 480KB each, which is fine — but after encoding overhead they exceed the limit. Increase the topic's messageMaxBytes to 5MB.",
        relatedConcept: 'message-size',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Also increase the producer's maxRequestSizeBytes and the consumer's fetchMaxBytes to match. Enable lz4 compression on the producer — lz4 reduces message size by ~45% with minimal CPU overhead.",
        relatedConcept: 'fetch-config',
        highlightElements: ['producer-config-panel', 'consumer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'video-metadata',
      partitionCount: 3,
      replicationFactor: 1,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,  // BUG: 1MB max but messages are ~480KB (after overhead, fail)
    }],
    producers: [{
      id: 'producer-video-upload',
      targetTopic: 'video-metadata',
      messagesPerSecond: 8,
      acks: 1,
      keyStrategy: 'random',
      messageSizeBytes: 480_000,   // ~480KB per message
      maxRequestSizeBytes: 1_048_576, // BUG: too small
      compressionType: 'none',
    }],
    consumers: [{
      id: 'consumer-thumbnail-indexer',
      groupId: 'thumbnail-group',
      subscribedTopics: ['video-metadata'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,
      maxPollRecords: 10,
      processingTimeMs: 100,
      fetchMaxBytes: 1_048_576,       // BUG: too small
      maxPartitionFetchBytes: 1_048_576,
    }],
  },

  failureScript: [
    { atTick: 10, type: 'record-too-large', target: 'producer-video-upload', params: { sizeBytes: 520_000 } },
  ],

  victoryConditions: [
    {
      id: 'producer-healthy',
      description: 'Producer is healthy (no RecordTooLargeException)',
      required: true,
      check: s => {
        const p = s.producers.get('producer-video-upload')
        return p?.isHealthy === true
      },
    },
    {
      id: 'lag-ok',
      description: 'Consumer lag below 50',
      required: true,
      check: s => s.metrics.totalLag < 50,
    },
  ],

  conceptCards: [
    {
      concept: 'large-messages',
      title: 'Large Message Configuration',
      body: "Three configs must be aligned for large messages: (1) topic's message.max.bytes, (2) producer's max.request.size, (3) consumer's fetch.max.bytes and max.partition.fetch.bytes. All must be large enough to accommodate your biggest message.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-message-size', 'set-fetch-config', 'set-compression'],
}

export default scenario
