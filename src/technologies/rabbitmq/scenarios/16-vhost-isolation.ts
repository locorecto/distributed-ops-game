import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-16-vhost',
  index: 16,
  title: 'Vhost Resource Contention',
  subtitle: 'Medium-Hard · Virtual Host Isolation',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['virtual-hosts', 'vhost-limits', 'resource-isolation', 'per-vhost-limits', 'max-queues'],

  briefing: {
    story:
      "A multi-tenant SaaS runs each customer in a separate vhost. A single customer (tenant-42) created 5,000 queues with persistent messages — exhausting shared broker memory. Other tenants are experiencing publish throttling even though they're using less than 1% of their fair share.",
    symptom:
      "The broker's memory usage is at 92%. tenant-42's vhost contains 5,000 queues consuming 7.4GB of the 8GB memory limit. Unrelated tenants on other vhosts are hitting publisher-blocking due to the shared memory alarm. tenant-42 has no queue count limit configured.",
    goal:
      'Set a max-queues limit of 500 on tenant-42\'s vhost to prevent further abuse, set a max-connections limit, and consider moving tenant-42 to a dedicated broker. Restore broker memory below 60% and re-enable publishing for other tenants.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Set a per-vhost queue limit for tenant-42: rabbitmqctl set_vhost_limits /tenant-42 '{\"max-queues\":500}'. This immediately prevents new queues from being created in that vhost.",
        relatedConcept: 'per-vhost-limits',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Also cap connections for tenant-42: '{\"max-connections\":50}'. Runaway connection creation from a single tenant can exhaust file descriptors for the entire broker.",
        relatedConcept: 'vhost-limits',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: "For long-term isolation, move tenant-42 to a dedicated broker. Per-vhost limits protect against accidents but a truly noisy tenant sharing infrastructure will always affect neighbours. Dedicated brokers with resource-based routing (e.g. per-tier clusters) give true isolation.",
        relatedConcept: 'resource-isolation',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@shared-broker', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 5000 },
    ],
    exchanges: [
      { name: 'tenant-42.events', type: 'direct', durable: true, autoDelete: false },
      { name: 'tenant-01.events', type: 'direct', durable: true, autoDelete: false },
      { name: 'tenant-02.events', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'tenant-42.queue-overflow',
        type: 'classic',
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
      {
        name: 'tenant-01.orders',
        type: 'classic',
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
      {
        name: 'tenant-02.orders',
        type: 'classic',
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
      { exchange: 'tenant-42.events', queue: 'tenant-42.queue-overflow', routingKey: 'evt' },
      { exchange: 'tenant-01.events', queue: 'tenant-01.orders', routingKey: 'order' },
      { exchange: 'tenant-02.events', queue: 'tenant-02.orders', routingKey: 'order' },
    ],
    publishers: [
      {
        id: 'publisher-tenant-42',
        targetExchange: 'tenant-42.events',
        routingKey: 'evt',
        messagesPerSecond: 2000,
        messageSizeBytes: 4096,
        confirmMode: false,
        persistent: true,
      },
      {
        id: 'publisher-tenant-01',
        targetExchange: 'tenant-01.events',
        routingKey: 'order',
        messagesPerSecond: 50,
        messageSizeBytes: 512,
        confirmMode: true,
        persistent: true,
      },
      {
        id: 'publisher-tenant-02',
        targetExchange: 'tenant-02.events',
        routingKey: 'order',
        messagesPerSecond: 50,
        messageSizeBytes: 512,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-tenant-01',
        queue: 'tenant-01.orders',
        prefetchCount: 10,
        ackMode: 'manual',
        processingTimeMs: 20,
        errorRate: 0,
      },
      {
        id: 'consumer-tenant-02',
        queue: 'tenant-02.orders',
        prefetchCount: 10,
        ackMode: 'manual',
        processingTimeMs: 20,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'vhost-queue-explosion', target: 'rabbit@shared-broker', params: { vhost: 'tenant-42', queueCount: 5000, memoryMb: 7400 } },
    { atTick: 6, type: 'memory-alarm', target: 'rabbit@shared-broker', params: {} },
    { atTick: 7, type: 'publisher-blocked', target: 'publisher-tenant-01', params: {} },
    { atTick: 7, type: 'publisher-blocked', target: 'publisher-tenant-02', params: {} },
  ],

  victoryConditions: [
    {
      id: 'vhost-limited',
      description: 'tenant-42 vhost has queue limit applied',
      required: true,
      check: s => !s.activeFailures.includes('vhost-queue-explosion'),
    },
    {
      id: 'memory-safe',
      description: 'Broker memory usage below 60%',
      required: true,
      check: s => s.metrics.memoryUsageRatio < 0.6,
    },
    {
      id: 'other-tenants-unblocked',
      description: 'Other tenant publishers unblocked',
      required: true,
      check: s => s.metrics.blockedPublishers === 0,
    },
  ],

  conceptCards: [
    {
      concept: 'per-vhost-limits',
      title: 'Per-Vhost Resource Limits',
      body: "Since RabbitMQ 3.7.0, you can set per-vhost limits for max-queues and max-connections. These are hard caps — attempts to declare a new queue or open a new connection beyond the limit are refused with an error. Apply these as part of tenant onboarding to prevent any single tenant from exhausting shared broker resources.",
      showWhenFixed: true,
    },
    {
      concept: 'virtual-hosts',
      title: 'Virtual Hosts (Vhosts)',
      body: "Vhosts provide namespace isolation within a single RabbitMQ broker: queues, exchanges, bindings, and policies in one vhost are invisible to others. However, vhosts share the same Erlang process pool, memory, disk, and file descriptor limits. A noisy tenant in one vhost can trigger memory or disk alarms that block ALL vhosts on the same broker.",
      showWhenFixed: false,
    },
    {
      concept: 'resource-isolation',
      title: 'True Resource Isolation',
      body: "Per-vhost limits reduce blast radius but do not provide true isolation. For SLA-sensitive tenants, dedicate separate broker clusters per tier (e.g. free / pro / enterprise). Use a routing layer (e.g. an API gateway or tenant-aware connection pool) to direct each tenant to their assigned cluster. This is the only way to guarantee that one tenant's workload cannot affect another's.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-vhost-max-queues',
    'set-vhost-max-connections',
    'move-tenant-to-dedicated-broker',
  ],
}

export default scenario
