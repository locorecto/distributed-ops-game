import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-28-delayed-message',
  index: 28,
  title: 'Delayed Message Scheduler Failure',
  subtitle: 'Expert · Delayed Message Exchange',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['rabbitmq-delayed-message-exchange', 'x-delayed-type', 'x-delay-header', 'mnesia-table', 'scheduler'],

  briefing: {
    story:
      "A reminder notification system uses rabbitmq-delayed-message-exchange to schedule 2M reminders up to 7 days in advance. The Mnesia table storing pending delayed messages hit its 2GB memory limit. New delayed messages are being silently dropped — 100,000 appointment reminders for tomorrow were never stored.",
    symptom:
      "The Mnesia table 'rabbit_delayed_message' has reached 2GB — the configured RAM table size limit. New messages published to the delayed exchange with x-delay headers are being silently discarded because the table has no capacity to store them. 100,000 tomorrow's appointment reminders were published but never scheduled. Patients won't receive notifications.",
    goal:
      'Purge expired delayed messages to free Mnesia table space, configure an external scheduler (e.g. Redis or a cron-based system) to replace the plugin for long-horizon delays, and reduce max-delay to limit future table growth. Verify the 100,000 lost reminders are rescheduled via an alternative path.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Immediately purge delivered or stale delayed messages from the Mnesia table. There is no built-in purge command — you must use the management API to delete and recreate the delayed exchange, which clears the table. WARNING: this drops ALL pending delayed messages. Export the table first if possible.",
        relatedConcept: 'mnesia-table',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Reduce max-delay to limit how far ahead messages can be scheduled. If your use case only needs delays up to 24 hours, set x-delayed-type-max-delay accordingly. This prevents the Mnesia table from accumulating weeks of pending messages.",
        relatedConcept: 'x-delay-header',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "For production scheduling of millions of delayed messages, the rabbitmq-delayed-message-exchange plugin is not designed for this scale — it uses in-memory Mnesia tables. Replace it with an external scheduler: store scheduled jobs in PostgreSQL with a timestamp column, run a cron job every minute to publish due messages to RabbitMQ via the normal exchange.",
        relatedConcept: 'scheduler',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 1000 },
      { id: 'rabbit@node-2', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 1000 },
    ],
    exchanges: [
      { name: 'reminders.delayed', type: 'direct', durable: true, autoDelete: false },
      { name: 'reminders', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'reminders.appointments',
        type: 'quorum',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'reminders', queue: 'reminders.appointments', routingKey: 'reminder' },
    ],
    publishers: [
      {
        id: 'publisher-reminder-scheduler',
        targetExchange: 'reminders.delayed',
        routingKey: 'reminder',
        messagesPerSecond: 100,
        messageSizeBytes: 512,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-notification-sender',
        queue: 'reminders.appointments',
        prefetchCount: 200,
        ackMode: 'manual',
        processingTimeMs: 50,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'mnesia-table-full', target: 'rabbit@node-1', params: { tableSizeGb: 2, pendingMessages: 2000000, droppedMessages: 100000 } },
    { atTick: 2, type: 'delayed-messages-dropped', target: 'reminders.delayed', params: { droppedCount: 100000, reason: 'mnesia-overflow' } },
  ],

  victoryConditions: [
    {
      id: 'mnesia-table-cleared',
      description: 'Mnesia table has capacity for new delayed messages',
      required: true,
      check: s => !s.activeFailures.includes('mnesia-table-full'),
    },
    {
      id: 'reminders-rescheduled',
      description: 'Lost reminders rescheduled via alternative path',
      required: true,
      check: s => !s.activeFailures.includes('delayed-messages-dropped'),
    },
    {
      id: 'health-good',
      description: 'System health score above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'rabbitmq-delayed-message-exchange',
      title: 'Delayed Message Exchange Plugin',
      body: "The rabbitmq_delayed_message_exchange community plugin stores messages in a Mnesia RAM table until their x-delay header timer fires, then routes them to the target exchange. It is simple to use but has a critical scalability limit: Mnesia tables are in-memory and bounded by the node's RAM. For more than ~100K pending delayed messages or delays exceeding a few hours, an external scheduler is more reliable.",
      showWhenFixed: true,
    },
    {
      concept: 'mnesia-table',
      title: 'Mnesia Table Limits',
      body: "RabbitMQ uses Mnesia (an Erlang distributed database) for metadata storage. The delayed message plugin's Mnesia table stores full message bodies in memory — unlike durable queue storage which uses disk. When the table reaches its size limit, write operations fail silently (messages are dropped without an error to the publisher). Monitor table size via the management API.",
      showWhenFixed: false,
    },
    {
      concept: 'scheduler',
      title: 'External Schedulers for Production',
      body: "For large-scale delayed messaging in production, use a dedicated scheduler: store jobs in PostgreSQL/MySQL with a 'deliver_at' timestamp, run a polling service every 10-60 seconds to query due jobs and publish them to RabbitMQ, then delete the jobs. This pattern scales to billions of pending jobs, survives RabbitMQ restarts, supports precise job cancellation, and enables full auditability.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'purge-expired-delayed-messages',
    'switch-to-external-scheduler',
    'reduce-max-delay',
  ],
}

export default scenario
