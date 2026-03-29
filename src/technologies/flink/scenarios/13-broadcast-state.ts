import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-broadcast-state',
  index: 13,
  title: 'Rule Engine — Static Rules Require Restart',
  subtitle: 'Medium-Hard · Broadcast State',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['broadcast-state', 'dynamic-rules', 'keyed-broadcast-process', 'rule-engine'],

  briefing: {
    story:
      'The fraud detection engine loads rules from a config file at startup. When compliance adds a new rule, the job must be fully restarted — 10 minutes of downtime and state rebuild. Last quarter, a fraud pattern was identified but the 10-minute deploy window allowed $2 M in fraudulent transactions to pass through.',
    symptom:
      'systemHealthScore drops every time rules are updated (restart cycle). Effective fraud detection delayed by minutes.',
    goal:
      'Implement broadcast state pattern. Stream new rules through a separate Kafka topic. Broadcast rules to all parallel instances without restarts. Achieve systemHealthScore above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'Create a broadcast stream from the rules Kafka topic. Use BroadcastProcessFunction to receive rule updates. Rules are stored in broadcast state — each operator instance gets a full copy.',
        relatedConcept: 'broadcast-state',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Call transactionStream.connect(rulesStream.broadcast(ruleStateDescriptor)).process(new FraudDetectionFunction()). In processElement, read rules from ctx.getBroadcastState(). In processBroadcastElement, update the broadcast state.',
        relatedConcept: 'keyed-broadcast-process',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-transactions',
        name: 'Transaction Source',
        parallelism: 8,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'source-rules',
        name: 'Rules Source (Kafka)',
        parallelism: 1,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'map-rule-engine',
        name: 'Rule Engine (static)',
        parallelism: 8,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
      {
        id: 'sink-fraud',
        name: 'Fraud Alert Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 15000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 10, maxHeapMb: 4096 },
      { id: 'tm-2', slots: 10, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 15000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 5,
      type: 'slow-operator',
      target: 'map-rule-engine',
      params: { latencyMs: 600, reason: 'rule-update-requires-restart' },
    },
  ],

  victoryConditions: [
    {
      id: 'health-good',
      description: 'System health above 85%',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'broadcast-state',
      title: 'Broadcast State',
      body: 'Broadcast state is a special state type in Flink where one stream (usually low-throughput config or rules) is broadcast to all parallel instances of a downstream operator. Each instance gets a full copy. Updates arrive without restarting the job.',
      showWhenFixed: true,
    },
    {
      concept: 'dynamic-rules',
      title: 'Dynamic Rule Engines',
      body: 'The broadcast state pattern is ideal for rule engines, config changes, and feature flags. The rules stream connects to the main keyed stream via KeyedBroadcastProcessFunction, giving access to both keyed per-user state and shared broadcast rules.',
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'configure-broadcast-state',
    'connect-broadcast-stream',
    'implement-broadcast-process-function',
    'configure-rules-source',
  ],
}

export default scenario
