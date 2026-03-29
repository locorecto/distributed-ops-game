import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'analyzer-mismatch',
  index: 7,
  title: 'The Invisible Emails',
  subtitle: 'Medium · Analyzers',
  difficulty: 'medium',
  estimatedMinutes: 15,
  coverConcepts: ['analyzers', 'keyword-analyzer', 'standard-analyzer', 'term-query'],

  briefing: {
    story: "The user management service stores email addresses in Elasticsearch for fast lookup. But the lookup feature has 0% hit rate — every search returns empty. The developers are using a term query to search by email, but the field uses the standard analyzer.",
    symptom: "Error rate is at 95% (queries return empty results, counted as errors in the SLA). Email 'John.Doe@Company.com' is stored as tokens ['john', 'doe', 'company', 'com'] by the standard analyzer. A term query for 'John.Doe@Company.com' finds no match.",
    goal: "Fix the analyzer mismatch. Reduce error rate below 1% and system health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The standard analyzer lowercases and splits on punctuation, so 'John.Doe@Company.com' becomes ['john', 'doe', 'company', 'com']. A term query expects an exact match on the full un-analyzed value.",
        relatedConcept: 'analyzers',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Map the email field as 'keyword' type — it stores values verbatim with no analysis. Or keep it as text but add a 'keyword' sub-field (email.keyword) for exact lookups. Remember: you'll need to reindex existing data.",
        relatedConcept: 'keyword-analyzer',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 500 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 500 },
    ],
    indices: [
      {
        name: 'users',
        shards: 2,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'user-lookup-service',
        targetIndex: 'users',
        queryType: 'term',
        requestsPerSec: 300,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'mapping-conflict', target: 'users', params: {} },
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
      concept: 'analyzer-mismatch',
      title: 'Analyzer Mismatch',
      body: "At index time, analyzers transform text into tokens. At query time, the same analyzer is applied to the search term. A term query bypasses analysis and expects an exact match. If the field was analyzed, term queries won't match unless you search for the analyzed form.",
      showWhenFixed: true,
    },
    {
      concept: 'keyword-analyzer',
      title: 'keyword vs text Fields',
      body: "'keyword' fields store the value as-is, enabling exact match, aggregation, and sorting. 'text' fields are analyzed for full-text search. For emails, IDs, and structured strings, always use 'keyword'. For prose, use 'text'. For both, use a multi-field with both types.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'reindex'],
}

export default scenario
