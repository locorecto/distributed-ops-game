import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'healthcare-monitor',
  index: 15,
  title: 'Healthcare Patient Monitor',
  subtitle: 'Hard · Session Timeouts & SLA',
  difficulty: 'hard',
  estimatedMinutes: 15,
  coverConcepts: ['session-timeout', 'heartbeat', 'poll-interval', 'sla', 'consumer-group'],
  maxLagForHealth: 200,
  slaMs: 5000,

  briefing: {
    story: "ICUAlert processes patient vitals from ICU monitors every 2 seconds. An SLA mandates alerts within 5 seconds. A consumer is hanging on a slow database write — it stops polling for 35 seconds. Kafka's session.timeout.ms=30000 means the broker waits 30 seconds before detecting the failure and triggering rebalance. During those 30 seconds, no vitals are processed.",
    symptom: "SLA breaches spiking. One consumer is hanging — but Kafka doesn't detect it for 30 seconds. Critical patient alerts are delayed.",
    goal: "Reduce session.timeout.ms to 6000 and heartbeat.interval.ms to 2000 so failures are detected within 6 seconds.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "session.timeout.ms=30000 means Kafka waits 30 seconds before declaring a consumer dead. For a 5-second SLA system, this is catastrophic. Reduce it to 6000ms.",
        relatedConcept: 'session-timeout',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Also reduce heartbeat.interval.ms to 2000 (must be ≤ session.timeout.ms / 3). And if the DB write takes too long, consider reducing max.poll.interval.ms — Kafka uses this to detect consumers stuck in processing.",
        relatedConcept: 'heartbeat',
        highlightElements: ['consumer-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'patient-vitals',
      partitionCount: 4,
      replicationFactor: 1,
      retentionMs: 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-monitors',
      targetTopic: 'patient-vitals',
      messagesPerSecond: 20,
      acks: 1,
      keyStrategy: 'random',
      messageSizeBytes: 256,
    }],
    consumers: [
      {
        id: 'consumer-alert-1',
        groupId: 'alert-group',
        subscribedTopics: ['patient-vitals'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 50,
        processingTimeMs: 80,     // BUG: slow DB writes
        sessionTimeoutMs: 30000,  // BUG: too long
        heartbeatIntervalMs: 10000, // BUG: too long
        maxPollIntervalMs: 300000,
      },
      {
        id: 'consumer-alert-2',
        groupId: 'alert-group',
        subscribedTopics: ['patient-vitals'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 50,
        processingTimeMs: 80,
        sessionTimeoutMs: 30000,
        heartbeatIntervalMs: 10000,
        maxPollIntervalMs: 300000,
      },
    ],
  },

  failureScript: [
    { atTick: 20, type: 'sla-breach', target: 'consumer-alert-1', params: { processingTimeMs: 8000 } },
  ],

  victoryConditions: [
    {
      id: 'session-timeout-ok',
      description: 'session.timeout.ms ≤ 6000',
      required: true,
      check: s => {
        const c = s.consumers.get('consumer-alert-1')
        const c2 = s.consumers.get('consumer-alert-2')
        return (c?.config.sessionTimeoutMs ?? 99999) <= 6000
          && (c2?.config.sessionTimeoutMs ?? 99999) <= 6000
      },
    },
    {
      id: 'heartbeat-ok',
      description: 'heartbeat.interval.ms ≤ 2000',
      required: true,
      check: s => {
        const c = s.consumers.get('consumer-alert-1')
        return (c?.config.heartbeatIntervalMs ?? 99999) <= 2000
      },
    },
    {
      id: 'sla-breaches-low',
      description: 'SLA breaches below 5',
      required: false,
      check: s => s.metrics.slaBreaches < 5,
    },
  ],

  conceptCards: [
    {
      concept: 'session-timeout',
      title: 'Session Timeout',
      body: "session.timeout.ms is how long Kafka waits without a heartbeat before declaring a consumer dead and triggering a rebalance. Lower values detect failures faster but increase false-positive rebalances on transient GC pauses. Rule of thumb: 3× heartbeat.interval.ms.",
      showWhenFixed: true,
    },
    {
      concept: 'poll-interval',
      title: 'max.poll.interval.ms',
      body: "If a consumer doesn't call poll() within max.poll.interval.ms, Kafka assumes it's stuck and kicks it from the group. Move heavy processing off the poll thread, or increase this value. Different from session.timeout.ms which detects network failures.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-session-timeout', 'set-heartbeat', 'set-poll-interval'],
}

export default scenario
