import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'multi-dc-dr',
  index: 20,
  title: 'Multi-DC Disaster Recovery',
  subtitle: 'Master · MirrorMaker & Geo-Replication',
  difficulty: 'master',
  estimatedMinutes: 25,
  coverConcepts: ['mirrormaker', 'multi-region', 'replication-factor', 'isr'],
  maxLagForHealth: 400,

  briefing: {
    story: "GlobalApp serves users in US-East and EU-West. The US-East Kafka cluster is the primary. There's no DR setup — if US-East goes down, the EU-West application has no data. A planned maintenance window is coming up in 10 minutes and the ops team needs geo-replication set up NOW.",
    symptom: "No cross-region replication. If US-East goes offline, EU-West consumers will starve. No disaster recovery capability.",
    goal: "Configure MirrorMaker replication from US-East to EU-West. Set replication.factor=3 on critical topics. Survive a US-East broker outage.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "MirrorMaker 2 replicates topics from one Kafka cluster to another. It's a Kafka Connect connector that reads from the source cluster and produces to the target cluster — maintaining offset mapping between them.",
        relatedConcept: 'mirrormaker',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Add a Mirror Link from us-east to eu-west for the 'global-events' topic. Also increase replication.factor to 3 on the source topic and set acks=all so no data is lost before it can be replicated.",
        relatedConcept: 'multi-region',
        highlightElements: ['mirror-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [
      { id: 0 },
      { id: 1 },
      { id: 2 },
    ],
    topics: [{
      name: 'global-events',
      partitionCount: 6,
      replicationFactor: 1, // BUG: no replication
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-us-east',
      targetTopic: 'global-events',
      messagesPerSecond: 25,
      acks: 1,   // BUG: acks=1, no guarantee before replication
      keyStrategy: 'random',
    }],
    consumers: [
      {
        id: 'consumer-us-east',
        groupId: 'us-east-group',
        subscribedTopics: ['global-events'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 100,
        processingTimeMs: 20,
      },
      {
        id: 'consumer-eu-west',
        groupId: 'eu-west-group',
        subscribedTopics: ['global-events'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 100,
        processingTimeMs: 20,
      },
    ],
  },

  failureScript: [
    { atTick: 50, type: 'broker-down', target: 'broker-0', params: {} },
  ],

  victoryConditions: [
    {
      id: 'replication-ok',
      description: 'Replication factor ≥ 3 on global-events',
      required: true,
      check: s => (s.topics.get('global-events')?.config.replicationFactor ?? 0) >= 3,
    },
    {
      id: 'acks-all',
      description: 'Producer acks = all',
      required: true,
      check: s => s.producers.get('producer-us-east')?.config.acks === -1,
    },
    {
      id: 'brokers-survive',
      description: 'System survives broker-0 outage',
      required: true,
      check: s => s.metrics.offlinePartitions === 0 && s.systemHealthScore > 60,
    },
  ],

  conceptCards: [
    {
      concept: 'mirrormaker',
      title: 'MirrorMaker 2',
      body: "MirrorMaker 2 (MM2) uses Kafka Connect to replicate topics between clusters. It maintains offset mappings, handles topic renames, and supports bidirectional replication. MM2 is essential for active-active and active-passive multi-region Kafka deployments.",
      showWhenFixed: true,
    },
    {
      concept: 'multi-region',
      title: 'Multi-Region Architecture',
      body: "In active-passive setups, the secondary cluster serves as a read replica or failover target. In active-active, both clusters accept writes and replicate to each other. Each pattern has different RTO/RPO trade-offs — choose based on your availability requirements.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['add-mirror-link', 'change-replication', 'set-producer-acks', 'set-min-isr', 'toggle-broker'],
}

export default scenario
