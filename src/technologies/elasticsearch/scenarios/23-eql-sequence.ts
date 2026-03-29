import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'eql-sequence',
  index: 23,
  title: 'The False Alarm Attack Detector',
  subtitle: 'Expert · EQL',
  difficulty: 'expert',
  estimatedMinutes: 30,
  coverConcepts: ['eql', 'eql-sequence', 'max-span', 'event-correlation'],

  briefing: {
    story: "The SOC team built an EQL sequence query to detect a 3-step attack pattern: failed login → privilege escalation → data exfiltration — all within 10 minutes. Without max_span, the detector is matching events 6 hours apart, generating hundreds of false positives per day and desensitizing the team.",
    symptom: "EQL sequence queries are extremely slow (30+ seconds) because they match across 6-hour windows. False positive rate is 98%. The query loads tens of millions of events into the sequence buffer. Heap pressure is near 90%.",
    goal: "Fix EQL sequence performance. Average latency below 1000ms and system health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Add max_span='10m' to the EQL sequence query. This restricts matching to sequences where all events occur within 10 minutes of each other. Without it, ES searches through the entire event history for potential sequence completions.",
        relatedConcept: 'max-span',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Also add sequence keys (the 'by' clause) to group sequences by user_id. This reduces the search space from all events to per-user sequences. Ensure the 'event.category' and '@timestamp' fields are keyword and date types respectively for optimal EQL performance.",
        relatedConcept: 'eql-sequence',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-3', roles: ['data'], heapGb: 32, diskGb: 2000 },
    ],
    indices: [
      {
        name: 'security-events',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: 'security-ilm',
      },
    ],
    clients: [
      {
        id: 'soc-analyst',
        targetIndex: 'security-events',
        queryType: 'match',
        requestsPerSec: 20,
      },
    ],
  },

  failureScript: [
    { atTick: 2, type: 'heap-pressure', target: 'node-1', params: { heapPct: 0.88 } },
    { atTick: 2, type: 'heap-pressure', target: 'node-2', params: { heapPct: 0.85 } },
    { atTick: 2, type: 'heap-pressure', target: 'node-3', params: { heapPct: 0.82 } },
    { atTick: 4, type: 'circuit-breaker', target: 'cluster', params: {} },
  ],

  victoryConditions: [
    {
      id: 'latency-ok',
      description: 'Average query latency below 1000ms',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 1000,
    },
    {
      id: 'health-good',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'eql',
      title: 'Event Query Language (EQL)',
      body: "EQL is designed for event-based threat detection. It supports sequence detection (event A followed by B followed by C), which is impossible with standard Elasticsearch queries. EQL queries always require a timestamp field and events are ordered chronologically.",
      showWhenFixed: true,
    },
    {
      concept: 'eql-sequence',
      title: 'EQL Sequence max_span',
      body: "max_span controls the maximum time window for a sequence to complete. Without it, ES must consider sequences spanning the entire dataset. With max_span='10m', only event chains completing within 10 minutes are considered. Always use max_span in production EQL sequences.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyNodeConfig', 'applyIndexConfig'],
}

export default scenario
