import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'index-template',
  index: 10,
  title: 'Template Priority War',
  subtitle: 'Medium · Index Templates',
  difficulty: 'medium',
  estimatedMinutes: 15,
  coverConcepts: ['index-templates', 'template-priority', 'component-templates', 'composable-templates'],

  briefing: {
    story: "The ops team created a new composable index template with proper mappings for the 'metrics-*' pattern. But a legacy template with priority 0 is still winning for new indices. The wrong mappings are being applied and aggregations are failing because 'value' is mapped as keyword instead of float.",
    symptom: "New metrics indices get the wrong field types from the legacy template. Aggregations on 'value' fail with 'Fielddata is disabled on text fields'. System health is degraded due to constant errors.",
    goal: "Fix the template priority conflict. Restore system health above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "Index templates have a 'priority' field. When multiple templates match an index name, the one with the highest priority wins. Your new composable template likely has a lower priority than the legacy template.",
        relatedConcept: 'template-priority',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Set your new composable template to priority 500 (legacy templates default to 0). Also ensure the index_patterns match correctly. You can use _simulate_index API to verify which template would be applied to a new index.",
        relatedConcept: 'composable-templates',
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
        name: 'metrics-2024.01.01',
        shards: 2,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: 'metrics-ilm',
      },
    ],
    clients: [
      {
        id: 'metrics-aggregator',
        targetIndex: 'metrics-2024.01.01',
        queryType: 'aggregation',
        requestsPerSec: 50,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'mapping-conflict', target: 'metrics-2024.01.01', params: {} },
  ],

  victoryConditions: [
    {
      id: 'health-good',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'index-templates',
      title: 'Index Template Priority',
      body: "When multiple index templates match a new index name, Elasticsearch applies the one with the highest 'priority' number. Legacy templates (created with PUT _template) have priority 0 by default. Composable templates (PUT _index_template) default to 0 too — always set explicit priority.",
      showWhenFixed: true,
    },
    {
      concept: 'component-templates',
      title: 'Component Templates',
      body: "Component templates are reusable building blocks (mappings, settings, aliases) that composable index templates assemble. This allows sharing common mappings (e.g., @timestamp field) across many index templates without duplication. Changes to a component template affect all templates using it.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'reindex'],
}

export default scenario
