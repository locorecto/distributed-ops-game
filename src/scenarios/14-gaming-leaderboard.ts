import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'gaming-leaderboard',
  index: 14,
  title: 'Gaming Leaderboard',
  subtitle: 'Medium-Hard · Partition Scaling & Key Routing',
  difficulty: 'medium-hard',
  estimatedMinutes: 15,
  coverConcepts: ['partition', 'message-key', 'key-routing', 'message-ordering', 'consumer-group'],
  maxLagForHealth: 500,

  briefing: {
    story: "BattleArena has millions of score updates per minute. The single-partition leaderboard topic is a bottleneck — one consumer handles everything and lag is growing. The player adds 8 partitions to fix it, but now score updates for the same player arrive out of order across partitions. The leaderboard shows wrong scores.",
    symptom: "After adding partitions, player scores are incorrect. Score update for player-X at rank 5 arrives AFTER their rank 3 update — wrong order!",
    goal: "Add partitions AND set message.key=playerId so each player's updates always route to the same partition.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "You've added partitions to scale throughput — great! But now messages without keys distribute round-robin. Player ABC's score updates land on different partitions and consumers process them out of order.",
        relatedConcept: 'message-ordering',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Set the producer's Key Strategy to 'fixed' with key 'playerId'. Now all updates for the same player hash to the same partition — ordered processing restored AND throughput scales with partition count.",
        relatedConcept: 'key-routing',
        highlightElements: ['producer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'leaderboard-updates',
      partitionCount: 1,  // starts with 1 — player will add more, causing ordering issues
      replicationFactor: 1,
      retentionMs: 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-game-server',
      targetTopic: 'leaderboard-updates',
      messagesPerSecond: 100,
      acks: 1,
      keyStrategy: 'null', // BUG: no key — adding partitions will break ordering
    }],
    consumers: [{
      id: 'consumer-leaderboard',
      groupId: 'leaderboard-group',
      subscribedTopics: ['leaderboard-updates'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,
      maxPollRecords: 200,
      processingTimeMs: 10,
    }],
  },

  failureScript: [
    { atTick: 5, type: 'consumer-lag-spike', target: 'all', params: { producerRateMultiplier: 5 } },
  ],

  victoryConditions: [
    {
      id: 'partitions-added',
      description: 'Topic has 4+ partitions',
      required: true,
      check: s => (s.topics.get('leaderboard-updates')?.config.partitionCount ?? 0) >= 4,
    },
    {
      id: 'key-set',
      description: 'Producer uses a message key',
      required: true,
      check: s => {
        const p = s.producers.get('producer-game-server')
        return p != null && p.config.keyStrategy !== 'null'
      },
    },
    {
      id: 'lag-ok',
      description: 'Consumer lag below 200',
      required: true,
      check: s => s.metrics.totalLag < 200,
    },
  ],

  conceptCards: [
    {
      concept: 'partition',
      title: 'Partitions & Ordering Trade-off',
      body: "Adding partitions increases throughput but breaks per-entity ordering if messages have no key. Always add partitions together with a meaningful key — the key hash determines which partition a message lands on, guaranteeing order per key.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['add-partitions', 'set-producer-key', 'add-consumer'],
}

export default scenario
