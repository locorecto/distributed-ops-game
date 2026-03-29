import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-22-connection-storm',
  index: 22,
  title: 'Connection Storm Overload',
  subtitle: 'Hard · Connection Limits',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['channel_max', 'connection-limits', 'reconnect-storm', 'connection-churn', 'heartbeat-tuning'],

  briefing: {
    story:
      "After a 5-minute network outage, 2,000 microservice instances all reconnected simultaneously, each opening 10 channels. The 20,000 channels overwhelmed RabbitMQ (channel_max: 2047 per connection, but 2000 connections * 10 channels = 20,000 total). CPU spiked to 100% from channel setup overhead. Services using retry without backoff are creating a reconnect loop.",
    symptom:
      "CPU is at 100%. Connection setup rate is 400/second — all 2,000 services are retrying every 5 seconds without backoff. Each successful connection immediately opens 10 channels. RabbitMQ's Erlang process scheduler is saturated handling channel setup. Some connections are timing out mid-handshake, causing the clients to retry immediately.",
    goal:
      'Add exponential backoff to reconnection logic to spread load over time, reduce channels per connection to 3 (use separate connections per concern), and set per-vhost connection limits. Get CPU below 60% and all services reconnected.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The immediate problem is the thundering-herd reconnect. Add exponential backoff with jitter: base=1s, max=60s, jitter=±30%. This spreads 2,000 reconnects over ~2 minutes instead of all at once. Libraries like amqplib support this natively.",
        relatedConcept: 'reconnect-storm',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Reduce channels per connection. Each service should use 1 channel for publishing and 1 for consuming — not 10. Channel setup is expensive in Erlang (each channel is a process). 2,000 connections × 2 channels = 4,000 channels total vs 20,000.",
        relatedConcept: 'channel_max',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Set per-vhost connection limits to cap total connections: rabbitmqctl set_vhost_limits / '{\"max-connections\":2500}'. This provides a circuit-breaker — if services misbehave during the next outage, new connection attempts are refused cleanly rather than overwhelming the broker.",
        relatedConcept: 'connection-limits',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 16384, minDiskFreeMb: 2000, maxConnections: 5000 },
      { id: 'rabbit@node-2', maxMemoryMb: 16384, minDiskFreeMb: 2000, maxConnections: 5000 },
      { id: 'rabbit@node-3', maxMemoryMb: 16384, minDiskFreeMb: 2000, maxConnections: 5000 },
    ],
    exchanges: [
      { name: 'microservices', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'service.commands',
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
      {
        name: 'service.events',
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
      { exchange: 'microservices', queue: 'service.commands', routingKey: 'cmd.#' },
      { exchange: 'microservices', queue: 'service.events', routingKey: 'evt.#' },
    ],
    publishers: [
      {
        id: 'publisher-services',
        targetExchange: 'microservices',
        routingKey: 'cmd.process',
        messagesPerSecond: 5000,
        messageSizeBytes: 512,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-command-handler',
        queue: 'service.commands',
        prefetchCount: 50,
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'connection-storm', target: 'rabbit@node-1', params: { connectionCount: 2000, channelsPerConnection: 10, reconnectIntervalMs: 5000, withBackoff: false } },
    { atTick: 2, type: 'cpu-spike', target: 'rabbit@node-1', params: { cpuPercent: 100, reason: 'channel-setup-overhead' } },
    { atTick: 2, type: 'cpu-spike', target: 'rabbit@node-2', params: { cpuPercent: 85, reason: 'channel-setup-overhead' } },
  ],

  victoryConditions: [
    {
      id: 'cpu-normal',
      description: 'CPU below 60% across all nodes',
      required: true,
      check: s => !s.activeFailures.includes('cpu-spike'),
    },
    {
      id: 'services-reconnected',
      description: 'All services successfully reconnected',
      required: true,
      check: s => s.metrics.totalConsumeRate > 0 && s.metrics.totalPublishRate > 0,
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
      concept: 'reconnect-storm',
      title: 'Thundering Herd Reconnection',
      body: "When a broker becomes available after an outage, all clients that were waiting attempt to reconnect simultaneously. Without backoff, this creates a 'thundering herd' that can overwhelm the broker faster than it recovered. Exponential backoff with jitter (randomised delay) spreads reconnections over time, reducing peak load. Most AMQP client libraries have built-in backoff support — enable it.",
      showWhenFixed: true,
    },
    {
      concept: 'channel_max',
      title: 'Channel Overhead',
      body: "In RabbitMQ's Erlang architecture, each channel is a lightweight process. Opening 20,000 channels simultaneously creates 20,000 Erlang processes, each consuming memory and scheduler time. Best practice: use 1 dedicated channel per logical operation (1 for publishing, 1 for consuming per connection). Never share channels between threads — channels are not thread-safe.",
      showWhenFixed: false,
    },
    {
      concept: 'connection-churn',
      title: 'Connection Churn',
      body: "Connection churn — opening and closing connections frequently — is expensive in RabbitMQ. Each connection requires a TLS handshake, AMQP negotiation, and Erlang process creation. Prefer long-lived connections with heartbeats over short-lived per-request connections. For services with variable load, use a connection pool (e.g. 5-20 connections shared across worker threads).",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'add-exponential-backoff',
    'reduce-channels-per-connection',
    'set-connection-limit-per-vhost',
  ],
}

export default scenario
