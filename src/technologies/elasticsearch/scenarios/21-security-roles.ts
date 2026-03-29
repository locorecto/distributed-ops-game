import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'security-roles',
  index: 21,
  title: 'Analyst Lockout',
  subtitle: 'Hard · Security',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['rbac', 'roles', 'index-privileges', 'field-level-security'],

  briefing: {
    story: "The security team migrated from Basic authentication to native realm with RBAC. After the migration, the entire data analyst team (50 users) lost access to Elasticsearch. All their queries return HTTP 403 Forbidden. The migration script forgot to create the 'analyst' role and assign it to users.",
    symptom: "Error rate is 100% — all analyst queries return 403. The 'analyst-read' role doesn't exist. Users in the 'analysts' group have no Elasticsearch roles assigned. Business dashboards are dark and the morning report is missing.",
    goal: "Restore analyst access. Error rate below 1% and system health above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Create an 'analyst-read' role with 'read' privilege on 'analytics-*' and 'logs-*' index patterns. Grant cluster privileges: 'monitor'. Then assign this role to the analyst users or their LDAP group.",
        relatedConcept: 'rbac',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Use field-level security to restrict analysts from reading PII fields (SSN, credit_card_number). Add document-level security to restrict them to documents where department='analytics'. Test access with the _has_privileges API before deploying.",
        relatedConcept: 'field-level-security',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 32, diskGb: 2000 },
      { id: 'node-2', roles: ['data'], heapGb: 32, diskGb: 2000 },
    ],
    indices: [
      {
        name: 'analytics-events',
        shards: 5,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: 'analytics-ilm',
      },
    ],
    clients: [
      {
        id: 'analyst-dashboard',
        targetIndex: 'analytics-events',
        queryType: 'aggregation',
        requestsPerSec: 30,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'mapping-conflict', target: 'analytics-events', params: {} },
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
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'rbac',
      title: 'Role-Based Access Control in ES',
      body: "Elasticsearch RBAC uses roles to define what actions a user can perform on which resources. A role has cluster privileges (monitor, manage), index privileges (read, write, create_index), and optionally field/document-level security. Assign roles to users or external groups (LDAP/AD).",
      showWhenFixed: true,
    },
    {
      concept: 'field-level-security',
      title: 'Field and Document Level Security',
      body: "Field-level security (FLS) restricts which fields a role can see. Use 'grant' to allow specific fields or 'except' to deny specific fields. Document-level security (DLS) adds a query filter — users only see documents matching the filter. Both FLS and DLS have a performance cost on every query.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'applyNodeConfig'],
}

export default scenario
