import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-15-federation',
  index: 15,
  title: 'Federation Link Disconnect',
  subtitle: 'Medium-Hard · Federation Plugin',
  difficulty: 'medium-hard',
  estimatedMinutes: 25,
  coverConcepts: ['federation-upstream', 'federation-link', 'exchange-federation', 'link-state', 'topology-sync'],

  briefing: {
    story:
      "A retail company federates RabbitMQ clusters across 4 regions. The EU upstream link to US-East keeps entering 'running→shutdown' cycles every 90 seconds. The link's heartbeat is set to 60 seconds but the NAT gateway times out idle connections after 30 seconds. Messages published to EU aren't reaching US-East consumers.",
    symptom:
      "The federation link between EU and US-East oscillates between 'running' and 'shutdown' states every ~90 seconds. During each reconnection window, 60–120 seconds of messages are buffered at EU and never forwarded. US-East consumers see large gaps in the message stream.",
    goal:
      'Reduce the federation heartbeat interval below the NAT gateway timeout (30 seconds) to keep the connection alive, or configure TCP keepalive at the OS level. Confirm the link stays in running state continuously for at least 5 minutes.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The NAT gateway is timing out idle connections after 30 seconds but the federation heartbeat is 60 seconds — the connection dies before the heartbeat fires. Set the heartbeat in the upstream URI to 20 seconds: amqp://...?heartbeat=20",
        relatedConcept: 'federation-upstream',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Alternatively, enable TCP keepalive on the RabbitMQ nodes with kernel.tcp_keepalive_time=10 (seconds). This sends TCP-level probes that keep the NAT mapping alive independently of the AMQP heartbeat.",
        relatedConcept: 'federation-link',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: "Verify the upstream URI is correct and test it with a direct AMQP connection from the US-East broker host. A misconfigured URI causes silent failures that look identical to network timeouts.",
        relatedConcept: 'topology-sync',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@eu-west-1', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 2000 },
      { id: 'rabbit@us-east-1', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 2000 },
    ],
    exchanges: [
      { name: 'retail.events', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'eu.orders',
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
        name: 'us-east.orders',
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
      { exchange: 'retail.events', queue: 'eu.orders', routingKey: 'order.#' },
      { exchange: 'retail.events', queue: 'us-east.orders', routingKey: 'order.#' },
    ],
    publishers: [
      {
        id: 'publisher-eu-checkout',
        targetExchange: 'retail.events',
        routingKey: 'order.created',
        messagesPerSecond: 200,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-us-east-processor',
        queue: 'us-east.orders',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 15,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 5, type: 'federation-link-flapping', target: 'rabbit@us-east-1', params: { upstreamNode: 'rabbit@eu-west-1', cycleSeconds: 90, heartbeatSeconds: 60, natTimeoutSeconds: 30 } },
    { atTick: 10, type: 'message-delivery-gap', target: 'us-east.orders', params: { gapPerCycleSeconds: 90 } },
  ],

  victoryConditions: [
    {
      id: 'link-stable',
      description: 'Federation link stays in running state',
      required: true,
      check: s => !s.activeFailures.includes('federation-link-flapping'),
    },
    {
      id: 'messages-flowing',
      description: 'Messages flowing from EU to US-East without gaps',
      required: true,
      check: s => s.metrics.totalConsumeRate > 150,
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
      concept: 'federation-upstream',
      title: 'Federation Upstream Configuration',
      body: "Federation upstreams are defined with a URI that can include AMQP parameters such as heartbeat: amqp://user:pass@host:5672/vhost?heartbeat=20. The heartbeat interval must be shorter than any NAT gateway or firewall idle-connection timeout along the network path, otherwise the TCP session is silently dropped between heartbeats.",
      showWhenFixed: true,
    },
    {
      concept: 'exchange-federation',
      title: 'Exchange Federation',
      body: "Exchange federation allows messages published to an upstream exchange to be forwarded to a local exchange on the downstream cluster — but only when there is a local binding that matches. Unlike shovel (which always moves messages), federation is demand-driven: if nobody on US-East is consuming order.# then no messages are forwarded from EU.",
      showWhenFixed: false,
    },
    {
      concept: 'link-state',
      title: 'Federation Link States',
      body: "A federation link transitions through states: starting → running (healthy) → shutdown (connection lost). When a link enters shutdown, RabbitMQ will attempt to reconnect using the reconnect-delay setting (default 5 seconds). Messages published during the disconnection are buffered at the upstream and forwarded once the link recovers.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'reduce-heartbeat-interval',
    'configure-tcp-keepalive',
    'check-upstream-uri',
  ],
}

export default scenario
