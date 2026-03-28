import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'stock-market',
  index: 6,
  title: 'Stock Market Data Feed',
  subtitle: 'Medium · Key Strategy & Message Ordering',
  difficulty: 'medium',
  estimatedMinutes: 10,
  coverConcepts: ['message-key', 'key-routing', 'message-ordering', 'partition'],
  maxLagForHealth: 300,

  briefing: {
    story: "TradingPro processes stock tick data for AAPL, GOOG, TSLA, and AMZN. With round-robin partitioning, trades for the same symbol land on different partitions and get processed out-of-order. The P&L calculation is showing incorrect values — a trade at $190 is processed before the earlier trade at $185.",
    symptom: "Ordering violations are spiking. The same stock symbol's trades arrive out-of-order across different consumers.",
    goal: "Eliminate ordering violations by setting message.key = stockSymbol so each symbol always routes to the same partition.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Round-robin assigns messages to partitions in sequence regardless of content. AAPL trades end up on partitions 0, 1, 2, 3... and consumers process them in parallel — wrong order!",
        relatedConcept: 'message-ordering',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Set the producer's Key Strategy to 'fixed' with key 'stockSymbol'. Kafka guarantees ordering within a partition, so all AAPL trades will always go to the same partition and be processed in order.",
        relatedConcept: 'key-routing',
        highlightElements: ['producer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'stock-ticks',
      partitionCount: 4,
      replicationFactor: 1,
      retentionMs: 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-market-feed',
      targetTopic: 'stock-ticks',
      messagesPerSecond: 40,
      acks: 1,
      keyStrategy: 'null', // BUG: no key causes ordering violation
      messageSizeBytes: 128,
    }],
    consumers: [
      { id: 'consumer-trader-1', groupId: 'trading-group', subscribedTopics: ['stock-ticks'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 100, processingTimeMs: 10 },
      { id: 'consumer-trader-2', groupId: 'trading-group', subscribedTopics: ['stock-ticks'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 100, processingTimeMs: 10 },
      { id: 'consumer-trader-3', groupId: 'trading-group', subscribedTopics: ['stock-ticks'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 100, processingTimeMs: 10 },
      { id: 'consumer-trader-4', groupId: 'trading-group', subscribedTopics: ['stock-ticks'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 100, processingTimeMs: 10 },
    ],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'no-ordering-violations',
      description: 'Ordering violations = 0',
      required: true,
      check: s => s.metrics.orderingViolations === 0,
    },
    {
      id: 'lag-low',
      description: 'Consumer lag below 100',
      required: true,
      check: s => s.metrics.totalLag < 100,
    },
  ],

  conceptCards: [
    {
      concept: 'message-ordering',
      title: 'Message Ordering in Kafka',
      body: "Kafka guarantees ordering within a single partition, not across partitions. If messages with the same key land on different partitions (due to null key + round-robin), ordering is lost. Always use a meaningful key when order matters.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-producer-key'],
}

export default scenario
