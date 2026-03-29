import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'watcher-latency',
  index: 22,
  title: 'The Watchdog That Barked Too Late',
  subtitle: 'Hard · Watcher',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['watcher', 'alert-throttle', 'webhook-timeout', 'async-actions'],

  briefing: {
    story: "The on-call team set up a Watcher alert to detect anomalies in transaction failure rates. The alert should fire within 5 minutes of an anomaly. But the PagerDuty webhook action times out after 5 seconds (PagerDuty is slow from the DC), causing the Watcher execution to block and miss subsequent trigger windows.",
    symptom: "Watcher executions are timing out. The blocked execution prevents other watchers from running on time. Mean time to alert is 45 minutes instead of 5 minutes. Heap pressure from accumulated watcher state is growing.",
    goal: "Fix Watcher reliability. System health above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Add a throttle_period to prevent the watcher from re-firing too frequently. Set webhook timeout to a short value (e.g., 5s). If PagerDuty is slow, use a webhook with async delivery or route through an internal relay that can queue the notification.",
        relatedConcept: 'alert-throttle',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Simplify the trigger condition — complex aggregation triggers consume more heap. Use condition.script with a pre-computed threshold rather than a multi-stage aggregation. Also reduce trigger interval frequency if sub-minute alerting isn't required.",
        relatedConcept: 'async-actions',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 1000 },
    ],
    indices: [
      {
        name: 'transactions',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
      {
        name: '.watches',
        shards: 1,
        replicas: 0,
        refreshIntervalMs: 1000,
        maxResultWindow: 1000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'transaction-producer',
        targetIndex: 'transactions',
        queryType: 'bulk-index',
        requestsPerSec: 1000,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.76 } },
    { atTick: 10, type: 'query-flood', target: 'cluster', params: {} },
  ],

  victoryConditions: [
    {
      id: 'health-good',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'watcher',
      title: 'Elasticsearch Watcher',
      body: "Watcher is ES's built-in alerting system. A watch has: trigger (schedule), input (query to run), condition (is alert needed?), actions (email/webhook/index). Watches execute on the master node — expensive watches can starve other master tasks. Keep watch queries lightweight.",
      showWhenFixed: true,
    },
    {
      concept: 'alert-throttle',
      title: 'Throttle Period and Reliability',
      body: "throttle_period prevents repeated alert firing: if the condition is met, the action fires once, then is suppressed for the throttle period. Always set timeouts on webhook actions. For slow external services, use an intermediary queue (Kafka, SQS) rather than blocking the Watcher thread.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig'],
}

export default scenario
