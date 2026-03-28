export const KAFKA_DEFAULTS = {
  topic: {
    partitionCount: 1,
    replicationFactor: 1,
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    retentionBytes: -1,
    cleanupPolicy: 'delete' as const,
    minInsyncReplicas: 1,
    messageMaxBytes: 1_048_576, // 1MB
  },
  producer: {
    acks: 1 as 0 | 1 | -1,
    retries: 3,
    retryBackoffMs: 100,
    idempotent: false,
    transactional: false,
    batchSizeBytes: 16384,
    lingerMs: 0,
    compressionType: 'none' as const,
    maxRequestSizeBytes: 1_048_576,
  },
  consumer: {
    autoOffsetReset: 'latest' as const,
    enableAutoCommit: true,
    autoCommitIntervalMs: 5000,
    maxPollRecords: 500,
    sessionTimeoutMs: 10000,
    heartbeatIntervalMs: 3000,
    maxPollIntervalMs: 300000,
    fetchMinBytes: 1,
    fetchMaxWaitMs: 500,
    fetchMaxBytes: 52428800, // 50MB
    maxPartitionFetchBytes: 1_048_576,
    processingTimeMs: 10,
    errorRate: 0,
  },
  broker: {
    diskCapacityBytes: 10 * 1024 * 1024 * 1024, // 10GB
  },
} as const

export const COMPRESSION_RATIOS: Record<string, number> = {
  none: 1.0,
  snappy: 0.5,
  gzip: 0.4,
  lz4: 0.55,
  zstd: 0.35,
}
