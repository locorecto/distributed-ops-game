import type { ScenarioDefinition } from './types'

const scenario: ScenarioDefinition = {
  id: 'schema-registry',
  index: 19,
  title: 'Schema Registry Migration',
  subtitle: 'Expert · Schema Evolution & Compatibility',
  difficulty: 'expert',
  estimatedMinutes: 18,
  coverConcepts: ['schema-registry', 'schema-evolution', 'avro'],
  maxLagForHealth: 200,

  briefing: {
    story: "DataPlatform uses Avro schemas stored in a Schema Registry. A developer added a new required field 'userSegment' to the user-events schema and deployed the new producer first. All consumers (still on the old schema) immediately started throwing deserialization errors and crashing — 100% of events are unprocessable.",
    symptom: "100% deserialization error rate. All consumers crash immediately on receiving new schema messages. Complete pipeline failure.",
    goal: "Fix the schema by making 'userSegment' optional with a default value (backward compatible). Update consumers to the new schema version first before updating the producer.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Adding a required field without a default breaks backward compatibility — old consumers can't deserialize messages produced with the new schema. Schema registries enforce compatibility rules to prevent this.",
        relatedConcept: 'schema-evolution',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Set the consumer schema version to 2 (adds optional userSegment field with a default). Once consumers are updated, update the producer to schema version 2 as well. BACKWARD compatibility means new consumers can read old messages — always update consumers first.",
        relatedConcept: 'schema-registry',
        highlightElements: ['connector-config-panel'],
      },
    ],
  },

  initialTopology: {
    brokers: [{ id: 0 }],
    topics: [{
      name: 'user-events',
      partitionCount: 4,
      replicationFactor: 1,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      retentionBytes: -1,
      cleanupPolicy: 'delete',
      minInsyncReplicas: 1,
      messageMaxBytes: 1_048_576,
    }],
    producers: [{
      id: 'producer-user-service',
      targetTopic: 'user-events',
      messagesPerSecond: 20,
      acks: 1,
      keyStrategy: 'random',
      schemaVersion: 2,  // BUG: producer on new schema, consumers on old
    }],
    consumers: [
      {
        id: 'consumer-analytics',
        groupId: 'analytics-group',
        subscribedTopics: ['user-events'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 100,
        processingTimeMs: 20,
        schemaVersion: 1,  // BUG: still on old schema → deserialization errors
      },
      {
        id: 'consumer-reporting',
        groupId: 'reporting-group',
        subscribedTopics: ['user-events'],
        autoOffsetReset: 'latest',
        enableAutoCommit: true,
        maxPollRecords: 100,
        processingTimeMs: 20,
        schemaVersion: 1,  // BUG: still on old schema
      },
    ],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'consumers-updated',
      description: 'All consumers on schema version 2',
      required: true,
      check: s => {
        const c1 = s.consumers.get('consumer-analytics')
        const c2 = s.consumers.get('consumer-reporting')
        return (c1?.config.schemaVersion ?? 0) >= 2 && (c2?.config.schemaVersion ?? 0) >= 2
      },
    },
    {
      id: 'deser-errors-zero',
      description: 'Deserialization errors = 0',
      required: true,
      check: s => s.metrics.deserializationErrors === 0,
    },
    {
      id: 'error-rate-ok',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
  ],

  conceptCards: [
    {
      concept: 'schema-evolution',
      title: 'Schema Evolution',
      body: "BACKWARD compatible changes (add optional field, remove field with default) can be read by old consumers. FORWARD compatible changes (remove field, add required field) can be read by new consumers. Always update consumers before producers for backward compatibility.",
      showWhenFixed: true,
    },
    {
      concept: 'schema-registry',
      title: 'Schema Registry',
      body: "A Schema Registry stores and versions Avro/Protobuf/JSON schemas. Producers embed a schema ID in each message. Consumers look up the schema by ID to deserialize. Compatibility modes (BACKWARD, FORWARD, FULL) enforce that schema changes don't break running consumers.",
      showWhenFixed: true,
    },
  ],

  availableActions: ['set-schema', 'set-compatibility-mode'],
}

export default scenario
