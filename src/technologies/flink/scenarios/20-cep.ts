import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-cep',
  index: 20,
  title: 'CEP Pattern Wrong Contiguity',
  subtitle: 'Hard · Complex Event Processing',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['cep', 'contiguity', 'pattern-matching', 'nfa'],

  briefing: {
    story:
      'The security team built a CEP pattern to detect brute-force login attacks: 5 failed logins within 1 minute. With relaxed contiguity (followedBy), non-consecutive events can match — a user who fails once per day across 5 days triggers the alert. False positive rate is through the roof.',
    symptom:
      'systemHealthScore degraded from false-positive overload. Alert volume 100x expected. Security team overwhelmed.',
    goal:
      'Switch the CEP pattern to strict contiguity (next) so only consecutive failure events match. Bring systemHealthScore above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Change followedBy() to next() in the CEP pattern chain. next() enforces strict contiguity — the events must appear consecutively with no other events in between for the same key.',
        relatedConcept: 'contiguity',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'Also add a within(Time.minutes(1)) clause to the pattern. Without a time bound, CEP retains state for every partially matched pattern indefinitely, causing state explosion.',
        relatedConcept: 'cep',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-login',
        name: 'Login Event Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'keyby-user',
        name: 'KeyBy userId',
        parallelism: 4,
        type: 'keyBy',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'cep-brute-force',
        name: 'CEP Brute Force Detector',
        parallelism: 4,
        type: 'window',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-alerts',
        name: 'Security Alert Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 3,
      type: 'state-backend-oom',
      target: 'cep-brute-force',
      params: { stateSizeMb: 2400, reason: 'relaxed-contiguity-state-explosion' },
    },
  ],

  victoryConditions: [
    {
      id: 'health-good',
      description: 'System health above 80%',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'cep',
      title: 'Flink CEP',
      body: 'FlinkCEP implements a non-deterministic finite automaton (NFA) to detect event patterns in streams. Patterns define sequences of conditions that must be satisfied. Partial matches are kept in state until they complete or expire.',
      showWhenFixed: false,
    },
    {
      concept: 'contiguity',
      title: 'CEP Contiguity',
      body: 'Flink CEP supports three contiguity levels: next() (strict — consecutive events only), followedBy() (relaxed — other events may appear between matches), followedByAny() (non-deterministic relaxed — all possible matches including overlaps). Use strict contiguity for security patterns to prevent false positives.',
      showWhenFixed: true,
    },
  ],

  availableActions: [
    'set-cep-contiguity',
    'set-pattern-time-bound',
    'configure-cep-pattern',
    'set-state-ttl',
  ],
}

export default scenario
