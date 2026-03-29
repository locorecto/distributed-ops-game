import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'mapping-conflict',
  index: 4,
  title: 'The Type Wars',
  subtitle: 'Easy · Mapping',
  difficulty: 'easy',
  estimatedMinutes: 10,
  coverConcepts: ['mapping', 'dynamic-mapping', 'strict-dynamic', 'field-types'],

  briefing: {
    story: "Two microservices are both writing to the same 'transactions' index. The payments service sends 'price' as a float (9.99) while the legacy billing service sends 'price' as a string (\"9.99 USD\"). Elasticsearch is throwing mapping exceptions and dropping documents.",
    symptom: "Error rate is ~80%. Mapper parsing exceptions fill the logs. The 'price' field type conflicts between float and text depending on which producer indexed first.",
    goal: "Fix the mapping conflict. Reduce error rate below 1% with system health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The root cause is dynamic mapping allowing different field types from different producers. Set dynamic to 'strict' to reject documents with unknown or conflicting fields instead of silently corrupting the mapping.",
        relatedConcept: 'strict-dynamic',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Create an explicit mapping with 'price' as float and 'dynamic: strict'. Fix the legacy billing service to send numeric price values. You may need to reindex existing data.",
        relatedConcept: 'mapping',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 1000 },
    ],
    indices: [
      {
        name: 'transactions',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'payments-service',
        targetIndex: 'transactions',
        queryType: 'bulk-index',
        requestsPerSec: 150,
      },
      {
        id: 'billing-legacy',
        targetIndex: 'transactions',
        queryType: 'bulk-index',
        requestsPerSec: 50,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'mapping-conflict', target: 'transactions', params: {} },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
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
      concept: 'mapping-conflict',
      title: 'Mapping Conflicts',
      body: "Once a field type is set in an Elasticsearch index, it cannot be changed. If two producers index the same field with different types, one will fail with a MapperParsingException. The fix is explicit mappings with 'dynamic: strict' to reject mismatched documents early.",
      showWhenFixed: true,
    },
    {
      concept: 'strict-dynamic',
      title: 'Dynamic Mapping Modes',
      body: "'true' (default) = auto-create fields. 'false' = ignore unknown fields. 'strict' = reject documents with unknown fields. Use 'strict' in production to prevent accidental schema evolution that requires costly reindexing.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'reindex'],
}

export default scenario
