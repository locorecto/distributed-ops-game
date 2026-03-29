import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'schema-forward-compat',
  index: 26,
  title: 'Schema Forward Compatibility',
  subtitle: 'Expert · Schema Evolution & Avro',
  difficulty: 'expert',
  estimatedMinutes: 20,
  coverConcepts: ['schema-evolution', 'avro', 'schema-registry', 'kafka-connect'],
  maxLagForHealth: 200,

  briefing: {
    story: "The DataPlatform team's user-events topic has been running Avro schema v1 with fields {userId, eventType, timestamp}. The platform team shipped schema v2 with a new required field 'userSegment' and deployed the new producer first — without updating the Schema Registry compatibility mode or adding a default value. All v1 consumers immediately began throwing deserialization errors and crashing. 100% of events are now unprocessable and the backlog is growing at 40 messages per second.",
    symptom: "All v1 consumers crashing with schema deserialization errors. Error rate is 100%. Topic backlog growing rapidly — over 2,400 unprocessed messages per minute. The analytics and reporting pipelines are completely stalled.",
    goal: "Fix the schema by adding a default value to 'userSegment' (making it backward compatible). Update consumers to schema v2 first, then upgrade the producer. Set the Schema Registry compatibility mode to BACKWARD to enforce safe evolution going forward.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Adding a required field without a default value breaks BACKWARD compatibility — old consumers cannot deserialize messages produced with the new schema. The fix is to make 'userSegment' optional with a default (e.g. null or an empty string). Use 'set-schema' to update the schema version and 'set-compatibility-mode' to enforce BACKWARD mode in the registry.",
        relatedConcept: 'schema-evolution',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Upgrade order matters: always update consumers to the new schema BEFORE upgrading the producer. Set consumer-analytics and consumer-reporting to schemaVersion 2 first. Once all consumers can handle v2 messages, switch the producer to v2. BACKWARD compatibility means new consumers can read old messages — this direction is safest for rolling upgrades.",
        relatedConcept: 'schema-registry',
        highlightElements: ['connector-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }, { id: 1 }, { id: 2 }],
    topics: [{
      name: 'user-events',
      partitionCount: 6,
      replicationFactor: 3,
      retentionMs: 86400000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 2,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-events',
      targetTopic: 'user-events',
      messagesPerSecond: 40,
      acks: 1,
      keyStrategy: 'random',
      schemaVersion: 2,  // BUG: producer already on v2 — breaking change, no default on userSegment
    }],
    consumers: [
      {
        id: 'consumer-analytics',
        groupId: 'analytics-group',
        subscribedTopics: ['user-events'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 20,
        schemaVersion: 1,  // BUG: still on old schema → deserialization errors
      },
      {
        id: 'consumer-reporting',
        groupId: 'reporting-group',
        subscribedTopics: ['user-events'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 200,
        processingTimeMs: 25,
        schemaVersion: 1,  // BUG: still on old schema → deserialization errors
      },
    ],
  },

  failureScript: [
    {
      atTick: 25,
      type: 'schema-incompatibility',
      target: 'producer-events',
      params: { schemaVersion: 2, breakingChange: true },
    },
  ],

  victoryConditions: [
    {
      id: 'consumers-on-v2',
      description: 'All consumers upgraded to schema version 2',
      required: true,
      check: s => {
        const analytics = s.consumers.get('consumer-analytics')
        const reporting = s.consumers.get('consumer-reporting')
        return (analytics?.config.schemaVersion ?? 0) >= 2 &&
               (reporting?.config.schemaVersion ?? 0) >= 2
      },
    },
    {
      id: 'deser-errors-cleared',
      description: 'Deserialization errors cleared to 0',
      required: true,
      check: s => s.metrics.deserializationErrors === 0,
    },
    {
      id: 'error-rate-ok',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'health-restored',
      description: 'System health score above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'schema-evolution',
      title: 'Schema Compatibility Modes',
      body: "BACKWARD compatibility means new schema consumers can read old messages — achieved by adding optional fields with defaults or removing fields. FORWARD compatibility means old schema consumers can read new messages — achieved by adding fields with defaults consumers can ignore. FULL compatibility satisfies both. Always choose BACKWARD for consumer-first deployments.",
      showWhenFixed: true,
    },
    {
      concept: 'schema-registry',
      title: 'BACKWARD vs FORWARD Compatibility',
      body: "BACKWARD (default in Confluent Schema Registry) protects consumers: upgrade consumers first, then producers. FORWARD protects producers: upgrade producers first, then consumers. A breaking change — like adding a required field without a default — violates both. Encode defaults in the Avro schema ('default': null) to make fields optional and maintain BACKWARD compatibility.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-schema', 'set-compatibility-mode', 'configure-retry', 'add-dlq'],
}

export default scenario
