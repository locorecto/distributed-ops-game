import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'audit-log',
  index: 10,
  title: 'Audit Log Compliance',
  subtitle: 'Medium · Replication & Durability',
  difficulty: 'medium',
  estimatedMinutes: 10,
  coverConcepts: ['replication-factor', 'isr', 'min-isr', 'broker-failure'],
  maxLagForHealth: 200,

  briefing: {
    story: "FinanceCore stores every user action in an audit log topic for regulatory compliance. The topic has replication.factor=1. During routine maintenance, broker-0 was restarted — and 3 hours of audit logs were permanently lost. The compliance team is now facing a $2M fine.",
    symptom: "Broker-0 restart caused data loss. The audit-events topic had no replicas — no fault tolerance at all.",
    goal: "Increase replication.factor to 3, set min.insync.replicas=2, set producer acks=all. Then safely restart broker-0 without data loss.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 50,
        text: "replication.factor=1 means there's only one copy of each message. If that broker dies, those messages are gone forever. For compliance data, always use RF≥3.",
        relatedConcept: 'replication-factor',
      },
      {
        order: 2,
        triggerOnHealthBelow: 30,
        text: "Set min.insync.replicas=2 so the broker requires at least 2 replicas to acknowledge before confirming a write. Combined with producer acks=all, this guarantees messages survive a single broker failure.",
        relatedConcept: 'min-isr',
        highlightElements: ['broker-config-panel', 'producer-config-panel'],
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
      name: 'audit-events',
      partitionCount: 3,
      replicationFactor: 1, // BUG: no replication
      retentionMs: 365 * 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1, // BUG: too low
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-audit',
      targetTopic: 'audit-events',
      messagesPerSecond: 10,
      acks: 1,    // BUG: not acks=all
      keyStrategy: 'random',
    }],
    consumers: [{
      id: 'consumer-audit-archiver',
      groupId: 'archiver-group',
      subscribedTopics: ['audit-events'],
      autoOffsetReset: 'earliest',
      enableAutoCommit: true,
      maxPollRecords: 100,
      processingTimeMs: 20,
    }],
  },

  failureScript: [
    { atTick: 30, type: 'broker-down', target: 'broker-0', params: {} },
  ],

  victoryConditions: [
    {
      id: 'replication-ok',
      description: 'Replication factor ≥ 3',
      required: true,
      check: s => {
        const topic = s.topics.get('audit-events')
        return topic != null && topic.config.replicationFactor >= 3
      },
    },
    {
      id: 'min-isr-ok',
      description: 'min.insync.replicas ≥ 2',
      required: true,
      check: s => {
        const topic = s.topics.get('audit-events')
        return topic != null && topic.config.minInsyncReplicas >= 2
      },
    },
    {
      id: 'acks-all',
      description: 'Producer acks = all (-1)',
      required: true,
      check: s => {
        const prod = s.producers.get('producer-audit')
        return prod?.config.acks === -1
      },
    },
    {
      id: 'health-ok',
      description: 'System health above 70%',
      required: false,
      check: s => s.systemHealthScore > 70,
    },
  ],

  conceptCards: [
    {
      concept: 'replication-factor',
      title: 'Replication Factor',
      body: "The replication factor determines how many copies of each partition exist across brokers. RF=3 means data survives 2 simultaneous broker failures. For critical data, always use RF≥3.",
      showWhenFixed: true,
    },
    {
      concept: 'min-isr',
      title: 'min.insync.replicas',
      body: "min.insync.replicas sets the minimum number of ISR (in-sync replicas) that must acknowledge a write when acks=all. If ISR drops below this threshold, the broker refuses new writes — trading availability for durability.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['change-replication', 'set-min-isr', 'set-producer-acks', 'toggle-broker'],
}

export default scenario
