import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'active-active-geo-replication',
  index: 28,
  title: 'Active-Active Geo-Replication Loop',
  subtitle: 'Expert · MirrorMaker 2 & Replication Cycles',
  difficulty: 'expert',
  estimatedMinutes: 22,
  coverConcepts: ['mirrormaker', 'multi-region', 'replication-factor', 'isr'],
  maxLagForHealth: 300,

  briefing: {
    story: "GlobalBank operates Kafka clusters in US-East and EU-West in an active-active configuration using MirrorMaker 2. A misconfiguration during a routine MirrorMaker upgrade removed the topic prefix convention (the '->' separator that prevents replicated topics from being re-replicated back). MirrorMaker is now replicating US-East topics back into US-East and EU-West topics back into EU-West — creating infinite replication loops. The same message IDs are appearing hundreds of times, topic sizes are growing 10x, and broker disk usage has hit 97%.",
    symptom: "Topic size growing exponentially. The same event IDs are appearing 100+ times across partitions. Broker disk usage at 97% and rising. Both clusters are producing at 10x their normal throughput due to loop amplification. Consumer lag is exploding as duplicate floods overwhelm processing capacity.",
    goal: "Stop the replication loop by re-enabling the topic exclusion pattern for remote-origin topics. Re-configure MirrorMaker to only replicate topics without a remote-origin prefix. Set replication factor to 3 and acks=all on the affected topics to ensure durability once the loop is stopped. Enable idempotent producers to prevent additional duplicates during recovery.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "MirrorMaker 2 prevents replication loops by prefixing replicated topics with the source cluster alias (e.g. 'us-east.orders' when replicated to EU-West). The EU-West MM2 instance is configured to exclude topics matching 'us-east.*' from being re-replicated back. When this prefix convention is removed, both MirrorMaker instances see the same topic names and endlessly replicate each other's data. Fix the topic exclusion pattern first.",
        relatedConcept: 'mirrormaker',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Once the loop is broken, enable idempotent producers (enable-idempotence) on both producer-us-east and producer-eu-west to prevent any further duplicate production. Set acks=-1 (all) and replication factor to 3 so no data is lost. The idempotent producer uses sequence numbers and a producer epoch to deduplicate retries at the broker level, even without transactions.",
        relatedConcept: 'multi-region',
        highlightElements: ['mirror-config-panel', 'producer-panel'],
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
        name: 'global-transactions',
        partitionCount: 6,
        replicationFactor: 2,  // BUG: under-replicated for critical financial data
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
      {
        name: 'user-activity',
        partitionCount: 4,
        replicationFactor: 2,  // BUG: under-replicated
        retentionMs: 24 * 60 * 60 * 1000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        minInsyncReplicas: 1,
        messageMaxBytes: 1_048_576,
      },
    ],
    producers: [
      {
        id: 'producer-us-east',
        targetTopic: 'global-transactions',
        messagesPerSecond: 30,
        acks: 1,          // BUG: acks=1 — no guarantee before geo-replication
        keyStrategy: 'random',
        idempotent: false,  // BUG: idempotence off — duplicates during retries
      },
      {
        id: 'producer-eu-west',
        targetTopic: 'user-activity',
        messagesPerSecond: 20,
        acks: 1,          // BUG: acks=1
        keyStrategy: 'random',
        idempotent: false,  // BUG: idempotence off
      },
    ],
    consumers: [
      {
        id: 'consumer-transactions-us',
        groupId: 'transactions-us-group',
        subscribedTopics: ['global-transactions'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 20,
      },
      {
        id: 'consumer-transactions-eu',
        groupId: 'transactions-eu-group',
        subscribedTopics: ['global-transactions'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 20,
      },
    ],
  },

  failureScript: [
    {
      atTick: 20,
      type: 'duplicate-messages',
      target: 'producer-us-east',
      params: { reason: 'mirror-loop', multiplier: 10 },
    },
    {
      atTick: 22,
      type: 'duplicate-messages',
      target: 'producer-eu-west',
      params: { reason: 'mirror-loop', multiplier: 10 },
    },
    {
      atTick: 35,
      type: 'replication-failure',
      target: 'broker-0',
      params: { reason: 'disk-full', diskPercent: 97 },
    },
  ],

  victoryConditions: [
    {
      id: 'duplicates-eliminated',
      description: 'Total duplicate message count is 0',
      required: true,
      check: s => {
        const usEast = s.producers.get('producer-us-east')
        const euWest = s.producers.get('producer-eu-west')
        return (usEast?.totalDuplicates ?? 0) === 0 && (euWest?.totalDuplicates ?? 0) === 0
      },
    },
    {
      id: 'acks-all',
      description: 'Both producers use acks=all (-1)',
      required: true,
      check: s => {
        const usEast = s.producers.get('producer-us-east')
        const euWest = s.producers.get('producer-eu-west')
        return usEast?.config.acks === -1 && euWest?.config.acks === -1
      },
    },
    {
      id: 'replication-ok',
      description: 'Replication factor ≥ 3 on global-transactions',
      required: true,
      check: s => (s.topics.get('global-transactions')?.config.replicationFactor ?? 0) >= 3,
    },
    {
      id: 'health-restored',
      description: 'System health score above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'mirrormaker',
      title: 'MirrorMaker 2 Cycle Detection',
      body: "MirrorMaker 2 prevents infinite replication loops by prepending the source cluster alias to replicated topic names (e.g. 'us-east.orders'). The replication policy on each cluster must exclude topics that already carry a remote-origin prefix. Without this exclusion, two active clusters endlessly mirror each other's replicated topics, causing exponential message amplification and disk exhaustion.",
      showWhenFixed: true,
    },
    {
      concept: 'multi-region',
      title: 'Active-Active Geo-Replication Patterns',
      body: "In active-active mode, both clusters accept writes and replicate to each other. Conflict resolution, cycle detection (via topic prefixes), and idempotent producers are essential safeguards. Use acks=all with min.insync.replicas=2 to ensure durability before replication. Consumer groups must track remote-origin offsets separately using MirrorMaker's RemoteClusterUtils to avoid double-processing.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['change-replication', 'set-producer-acks', 'set-min-isr', 'enable-idempotence', 'add-mirror-link'],
}

export default scenario
