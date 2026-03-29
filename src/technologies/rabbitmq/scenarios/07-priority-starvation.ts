import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-priority-starvation',
  index: 7,
  title: 'Priority Queue Starvation',
  subtitle: 'Medium · Priority Queues & Fairness',
  difficulty: 'medium',
  estimatedMinutes: 12,
  coverConcepts: ['priority-queue', 'message-priority', 'starvation', 'consumer-fairness'],

  briefing: {
    story:
      "TaskRunner uses a priority queue with max-priority=10 to process background jobs. Critical system jobs use priority=10, regular user jobs use priority=1. The system is overloaded with high-priority tasks. Low-priority jobs (user background syncs) haven't processed in hours — they are completely starved.",
    symptom:
      "Max-priority=10 creates 10 internal Erlang sub-queues, increasing memory overhead. High-priority (10) jobs flood in at 5,000/s. Low-priority (1) jobs never get CPU time. The consumer only has one thread and always services the highest-priority bucket first.",
    goal:
      'Reduce max-priority from 10 to 3 (critical/normal/low). This reduces memory overhead and improves fairness. Implement consumer-side fairness by capping prefetch. System health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Priority queues in RabbitMQ should have small max-priority values (3-5 max). Each priority level creates an internal sub-queue. Higher max-priority = more memory overhead and more starvation risk for low-priority messages.",
        relatedConcept: 'priority-queue',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Set max-priority=3 on the 'jobs' queue. Map your priorities: 3=critical, 2=normal, 1=low. Also set prefetch_count=10 on the consumer to prevent one burst of high-priority messages from starving lower priority levels.",
        relatedConcept: 'consumer-fairness',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 4096, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'tasks', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'jobs',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 500000,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: 10,  // BUG: too high, causes starvation and memory overhead
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'tasks', queue: 'jobs', routingKey: 'job' },
    ],
    publishers: [
      {
        id: 'publisher-critical',
        targetExchange: 'tasks',
        routingKey: 'job',
        messagesPerSecond: 5000,
        messageSizeBytes: 256,
        confirmMode: false,
        persistent: true,
      },
      {
        id: 'publisher-user-jobs',
        targetExchange: 'tasks',
        routingKey: 'job',
        messagesPerSecond: 200,
        messageSizeBytes: 128,
        confirmMode: false,
        persistent: false,
      },
    ],
    consumers: [
      {
        id: 'consumer-worker',
        queue: 'jobs',
        prefetchCount: 1000,  // BUG: large prefetch allows high-pri messages to fill all slots
        ackMode: 'manual',
        processingTimeMs: 2,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    // Simulate priority starvation building up
    { atTick: 5, type: 'publisher-flood', target: 'publisher-critical', params: { rate: 8000 } },
    { atTick: 30, type: 'publisher-flood', target: 'publisher-critical', params: { rate: 5000 } },
  ],

  victoryConditions: [
    {
      id: 'health-good',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
    {
      id: 'queue-manageable',
      description: 'Jobs queue depth below 50,000',
      required: true,
      check: s => (s.queues.get('jobs')?.depth ?? Infinity) < 50_000,
    },
  ],

  conceptCards: [
    {
      concept: 'priority-queue',
      title: 'Priority Queues in RabbitMQ',
      body: "Setting x-max-priority on a classic queue enables message priority. RabbitMQ creates internal sub-queues for each priority level. Higher priority messages are delivered first. Warning: each priority level consumes additional memory. Keep max-priority small (3-5). Larger values increase memory overhead without meaningful benefit.",
      showWhenFixed: true,
    },
    {
      concept: 'starvation',
      title: 'Priority Starvation',
      body: "Starvation occurs when low-priority messages never get processed because high-priority messages continuously arrive. Mitigations: (1) limit max-priority to 3, (2) use small prefetch_count so the consumer re-evaluates priority per batch, (3) implement aging — boost message priority after a time threshold, (4) use separate queues per priority level with consumer quotas.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-max-priority',
    'set-prefetch-count',
    'set-publisher-rate',
  ],
}

export default scenario
