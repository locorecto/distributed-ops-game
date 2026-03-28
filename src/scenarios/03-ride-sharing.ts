import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'ride-sharing',
  index: 3,
  title: 'Ride-Sharing Dispatch',
  subtitle: 'Easy · Message Keys & Hot Partitions',
  difficulty: 'easy',
  estimatedMinutes: 8,
  coverConcepts: ['message-key', 'key-routing', 'hot-partition', 'partition'],
  maxLagForHealth: 400,

  briefing: {
    story: "RideNow just launched a premium 'Luxury' vehicle tier. Trip requests for luxury cars have no message key assigned — so Kafka uses round-robin... but all luxury trips are landing on partition 0. One consumer is overwhelmed while the others sit idle.",
    symptom: "Partition 0 is overloaded (hot partition). Luxury requests are backing up while other consumers have nothing to do.",
    goal: "Eliminate the hot partition by setting the producer key strategy to 'fixed' with key 'vehicleType'. Lag should drop below 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "When a producer sends messages without a key (null), Kafka uses round-robin. But if the load isn't uniform, this causes hot partitions. Look at the partition heat — partition 0 is glowing red.",
        relatedConcept: 'hot-partition',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Set the producer's Key Strategy to 'fixed' and Key to 'vehicleType'. This will spread messages across partitions by hashing the key. A better fix in production would use the actual vehicle type value.",
        relatedConcept: 'key-routing',
        highlightElements: ['producer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'trip-requests',
      partitionCount: 4,
      replicationFactor: 1,
      retentionMs: 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [
      {
        id: 'producer-standard',
        targetTopic: 'trip-requests',
        messagesPerSecond: 8,
        acks: 1,
        keyStrategy: 'fixed',
        fixedKey: 'standard',
      },
      {
        id: 'producer-luxury',
        targetTopic: 'trip-requests',
        messagesPerSecond: 20,
        acks: 1,
        keyStrategy: 'null', // BUG: no key → all go to partition 0
      },
    ],
    consumers: [
      { id: 'consumer-dispatch-1', groupId: 'dispatch-group', subscribedTopics: ['trip-requests'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 50, processingTimeMs: 15 },
      { id: 'consumer-dispatch-2', groupId: 'dispatch-group', subscribedTopics: ['trip-requests'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 50, processingTimeMs: 15 },
      { id: 'consumer-dispatch-3', groupId: 'dispatch-group', subscribedTopics: ['trip-requests'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 50, processingTimeMs: 15 },
      { id: 'consumer-dispatch-4', groupId: 'dispatch-group', subscribedTopics: ['trip-requests'], autoOffsetReset: 'latest', enableAutoCommit: true, maxPollRecords: 50, processingTimeMs: 15 },
    ],
  },

  failureScript: [],

  victoryConditions: [
    { id: 'lag-low', description: 'Consumer lag below 80', required: true, check: s => s.metrics.totalLag < 80 },
    { id: 'health-good', description: 'System health above 75%', required: true, check: s => s.systemHealthScore > 75 },
  ],

  conceptCards: [
    {
      concept: 'hot-partition',
      title: 'Hot Partitions',
      body: "A hot partition occurs when too many messages are routed to the same partition, overloading one consumer while others idle. This usually happens when producers use null keys (round-robin) with uneven traffic, or when all messages share the same key.",
      showWhenFixed: true,
    },
    {
      concept: 'key-routing',
      title: 'Key-Based Routing',
      body: "When a message has a key, Kafka hashes it (murmur2) and routes it to a consistent partition. Same key always → same partition. This guarantees ordering per key AND distributes load when keys are diverse.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-producer-key', 'add-partitions'],
}

export default scenario
