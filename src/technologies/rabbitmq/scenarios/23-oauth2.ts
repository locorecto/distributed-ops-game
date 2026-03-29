import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-23-oauth2',
  index: 23,
  title: 'OAuth 2.0 Token Expiry',
  subtitle: 'Hard · Authentication',
  difficulty: 'hard',
  estimatedMinutes: 35,
  coverConcepts: ['oauth2-authentication', 'JWT-tokens', 'token-refresh', 'rabbitmq-auth-backend-oauth2', 'scope-mapping'],

  briefing: {
    story:
      "Your microservices authenticate to RabbitMQ using OAuth 2.0 JWT tokens from Keycloak. After upgrading Keycloak, token expiry was reduced from 24 hours to 15 minutes. Services with long-lived connections started failing after 15 minutes with auth errors — AMQP connections don't auto-refresh tokens. 12 services are now failing authentication.",
    symptom:
      "After the Keycloak upgrade, 12 services started receiving AMQP auth errors 15 minutes into their connection lifetime. The services opened connections with a valid JWT, but AMQP has no built-in token refresh mechanism — the connection stays open with a stale token. When the token expires, RabbitMQ rejects subsequent operations on that connection.",
    goal:
      'Implement token refresh logic in service clients (reconnect with a new token before expiry), increase Keycloak token expiry back to acceptable levels for long-lived connections, or configure the auth backend to use a longer-lived service account. Restore all 12 services to operational status.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The correct long-term fix is token refresh. Each service should schedule a reconnection ~80% through the token lifetime (at 12 minutes for a 15-minute token). Before the token expires, open a new AMQP connection with a fresh token, transfer consumers, then close the old connection.",
        relatedConcept: 'token-refresh',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Short-term: increase the Keycloak realm's access token lifespan back to 60 minutes. This gives time to implement proper token refresh. Navigate to Realm Settings → Tokens → Access Token Lifespan.",
        relatedConcept: 'JWT-tokens',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Check the rabbitmq_auth_backend_oauth2 configuration. Verify that scope-to-permission mapping is correct after the Keycloak upgrade — sometimes scope names change between versions. Use rabbitmqctl authenticate_user with a test token to validate the backend configuration.",
        relatedConcept: 'rabbitmq-auth-backend-oauth2',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 2000 },
      { id: 'rabbit@node-2', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 2000 },
    ],
    exchanges: [
      { name: 'services', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'service.tasks',
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
        name: 'service.responses',
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
      { exchange: 'services', queue: 'service.tasks', routingKey: 'task.#' },
      { exchange: 'services', queue: 'service.responses', routingKey: 'response.#' },
    ],
    publishers: [
      {
        id: 'publisher-api-gateway',
        targetExchange: 'services',
        routingKey: 'task.process',
        messagesPerSecond: 200,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-worker-service',
        queue: 'service.tasks',
        prefetchCount: 20,
        ackMode: 'manual',
        processingTimeMs: 50,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 15, type: 'auth-token-expired', target: 'rabbit@node-1', params: { affectedServices: 12, tokenExpiryMinutes: 15, previousExpiryMinutes: 1440 } },
    { atTick: 16, type: 'consumer-auth-failure', target: 'consumer-worker-service', params: {} },
    { atTick: 16, type: 'publisher-auth-failure', target: 'publisher-api-gateway', params: {} },
  ],

  victoryConditions: [
    {
      id: 'auth-restored',
      description: 'All services authenticated successfully',
      required: true,
      check: s => !s.activeFailures.includes('auth-token-expired'),
    },
    {
      id: 'services-operational',
      description: 'All 12 services back to operational',
      required: true,
      check: s => s.metrics.totalConsumeRate > 150 && s.metrics.totalPublishRate > 150,
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
      concept: 'token-refresh',
      title: 'Token Refresh for AMQP Connections',
      body: "AMQP 0-9-1 has no built-in mechanism to refresh credentials on an existing connection — authentication happens at connection open time. For OAuth 2.0 JWT tokens, clients must proactively reconnect before token expiry. The recommended pattern: schedule a reconnect at 80% of token lifetime, open a new connection with a fresh token, migrate consumers and publishers, then gracefully close the old connection.",
      showWhenFixed: true,
    },
    {
      concept: 'JWT-tokens',
      title: 'JWT Tokens in RabbitMQ',
      body: "RabbitMQ's OAuth 2.0 backend (rabbitmq_auth_backend_oauth2) validates JWT tokens on connection open. The token's 'exp' claim defines expiry but RabbitMQ does not re-validate the token after initial authentication — a connection opened with a valid token stays open even after the token expires. This means expired tokens only cause failures on new connections or reconnections.",
      showWhenFixed: false,
    },
    {
      concept: 'scope-mapping',
      title: 'OAuth 2.0 Scope-to-Permission Mapping',
      body: "RabbitMQ maps JWT scopes to AMQP permissions using the scope-prefix and resource server ID configuration. A scope like 'rabbitmq.read:*/*' grants read access to all queues. After an IdP upgrade, verify that scope names haven't changed — Keycloak sometimes renames scopes between major versions, silently removing permissions that were previously granted.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'implement-token-refresh',
    'increase-token-expiry',
    'configure-auth-backend-correctly',
  ],
}

export default scenario
