import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'analytics-dashboard',
  index: 11,
  title: 'Real-Time Analytics Dashboard',
  subtitle: 'Medium-Hard · Manual Commit & Offset Management',
  difficulty: 'medium-hard',
  estimatedMinutes: 15,
  coverConcepts: ['manual-commit', 'offset', 'at-least-once', 'auto-commit'],
  maxLagForHealth: 400,

  briefing: {
    story: "MetricsDash processes clickstream events to power a live dashboard. With auto-commit enabled, the consumer commits offsets every 5 seconds automatically. A DB write failure caused some events to be committed before being processed — those events are permanently lost from the dashboard.",
    symptom: "Events are being silently dropped. Auto-commit committed offsets before the DB write succeeded — data loss on consumer failure.",
    goal: "Disable auto-commit and switch to manual commit after successful processing. Error rate should drop to 0.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Auto-commit periodically commits the current offset regardless of whether messages were successfully processed. If the consumer crashes between the auto-commit and actually processing the message, that data is lost forever.",
        relatedConcept: 'auto-commit',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Disable auto-commit and switch to manual commit mode. The consumer should call commitSync() only after successfully writing to the DB — this guarantees at-least-once delivery.",
        relatedConcept: 'manual-commit',
        highlightElements: ['consumer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'clickstream',
      partitionCount: 4,
      replicationFactor: 1,
      retentionMs: 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-web',
      targetTopic: 'clickstream',
      messagesPerSecond: 30,
      acks: 1,
      keyStrategy: 'random',
      messageSizeBytes: 256,
    }],
    consumers: [{
      id: 'consumer-dashboard',
      groupId: 'dashboard-group',
      subscribedTopics: ['clickstream'],
      autoOffsetReset: 'latest',
      enableAutoCommit: true,   // BUG: auto-commit causes data loss on failure
      autoCommitIntervalMs: 5000,
      maxPollRecords: 200,
      processingTimeMs: 20,
      errorRate: 0.08,          // simulates DB write failures
    }],
  },

  failureScript: [
    { atTick: 20, type: 'consumer-slow', target: 'consumer-dashboard', params: { processingTimeMs: 100 } },
  ],

  victoryConditions: [
    {
      id: 'manual-commit-enabled',
      description: 'Auto-commit disabled',
      required: true,
      check: s => {
        const c = s.consumers.get('consumer-dashboard')
        return c?.config.enableAutoCommit === false
      },
    },
    {
      id: 'error-rate-ok',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
    },
  ],

  conceptCards: [
    {
      concept: 'manual-commit',
      title: 'Manual Offset Commit',
      body: "With enableAutoCommit=false, you control exactly when offsets are committed. Commit after successful processing to guarantee at-least-once delivery. This prevents data loss but may cause reprocessing on failure — build idempotent consumers to handle this.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['enable-manual-commit', 'set-offset-reset'],
}

export default scenario
