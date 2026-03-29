import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'partition-leader-imbalance',
  index: 27,
  title: 'Partition Leadership Imbalance',
  subtitle: 'Expert · Preferred-Replica Election & Broker Load',
  difficulty: 'expert',
  estimatedMinutes: 18,
  coverConcepts: ['replication-factor', 'isr', 'broker-failure', 'min-isr'],
  maxLagForHealth: 300,

  briefing: {
    story: "A high-volume financial data platform runs on a 3-broker Kafka cluster. Last week, broker-1 and broker-2 were taken offline for OS patching and brought back up — but the ops team forgot to trigger a preferred-replica election afterward. Kafka's automatic leader election kicked in during the outage and assigned broker-0 as the leader for 85% of all partitions. Brokers 1 and 2 are sitting idle at 8% CPU while broker-0 is completely saturated, causing 2–3 second produce latency that violates the 100ms SLA.",
    symptom: "Produce latency on broker-0 has reached 2500ms against a 100ms SLA. Brokers 1 and 2 are nearly idle at 8% CPU each. Partition leadership is severely skewed — broker-0 leads 85% of all partitions instead of the expected ~33%. Consumer lag is climbing as throughput collapses on the overloaded leader.",
    goal: "Trigger a preferred-replica election to redistribute partition leadership evenly across all three brokers. Verify that produce latency drops back below 100ms and that no partitions go offline during the rebalance.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "When brokers restart after maintenance, Kafka does not automatically return partition leadership to the preferred (original) replica. Leadership stays wherever it landed during failover. This skew accumulates over time — one broker bears all the write load while others are underutilized. Use 'trigger-leader-election' to reassign leaders back to their preferred replicas.",
        relatedConcept: 'replication-factor',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Before triggering the election, make sure brokers 1 and 2 are fully in-sync (check ISR lists). If min.insync.replicas is set too high and replicas are lagging, a leader election could temporarily make partitions unavailable. Verify the replication factor is 3 and ISR is healthy on all partitions, then trigger the preferred-replica election.",
        relatedConcept: 'isr',
        highlightElements: ['broker-panel'],
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
      name: 'financial-data',
      partitionCount: 12,
      replicationFactor: 3,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 2,
      messageMaxBytes: 1_048_576,
    }],
    producers: [
      {
        id: 'producer-trades',
        targetTopic: 'financial-data',
        messagesPerSecond: 50,
        acks: -1,
        keyStrategy: 'random',
      },
      {
        id: 'producer-quotes',
        targetTopic: 'financial-data',
        messagesPerSecond: 30,
        acks: -1,
        keyStrategy: 'random',
      },
    ],
    consumers: [
      {
        id: 'consumer-risk-engine',
        groupId: 'risk-engine-group',
        subscribedTopics: ['financial-data'],
        autoOffsetReset: 'latest',
        enableAutoCommit: false,
        maxPollRecords: 500,
        processingTimeMs: 15,
        sessionTimeoutMs: 30000,
      },
      {
        id: 'consumer-analytics',
        groupId: 'analytics-group',
        subscribedTopics: ['financial-data'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 30,
      },
    ],
  },

  failureScript: [
    {
      atTick: 15,
      type: 'partition-imbalance',
      target: 'broker-0',
      params: { skewPercent: 85, affectedTopic: 'financial-data' },
    },
    {
      atTick: 20,
      type: 'consumer-slow',
      target: 'consumer-risk-engine',
      params: { reason: 'broker-0-saturation', latencyMs: 2500 },
    },
  ],

  victoryConditions: [
    {
      id: 'no-offline-partitions',
      description: 'No offline partitions during or after rebalance',
      required: true,
      check: s => s.metrics.offlinePartitions === 0,
    },
    {
      id: 'health-restored',
      description: 'System health score above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
    {
      id: 'brokers-online',
      description: 'All three brokers online and healthy',
      required: true,
      check: s => {
        const b0 = s.brokers.get(0)
        const b1 = s.brokers.get(1)
        const b2 = s.brokers.get(2)
        return (b0?.isOnline ?? false) && (b1?.isOnline ?? false) && (b2?.isOnline ?? false)
      },
    },
  ],

  conceptCards: [
    {
      concept: 'replication-factor',
      title: 'Preferred Replica Election',
      body: "Each partition has a 'preferred replica' — the first broker listed in the replica assignment, typically the original leader at topic creation. When a broker restarts after failure or maintenance, Kafka does not automatically restore its preferred leadership. Run preferred-replica election (kafka-leader-election.sh or the AdminClient API) after any broker maintenance to rebalance leadership and prevent load skew.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['toggle-broker', 'change-replication', 'set-min-isr', 'trigger-leader-election' as never],
}

export default scenario
