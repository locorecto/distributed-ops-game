export type TechKey = 'kafka' | 'redis' | 'elasticsearch' | 'flink' | 'rabbitmq'

export interface TechDefinition {
  key: TechKey
  name: string
  tagline: string
  color: string          // hex color for the tech accent
  bgColor: string        // hex color for the card background
  icon: string           // emoji
  scenarioCount: number
  concepts: string[]     // top 5 concepts covered
}

export const TECH_DEFINITIONS: Record<TechKey, TechDefinition> = {
  kafka: {
    key: 'kafka',
    name: 'Apache Kafka',
    tagline: 'Distributed event streaming platform',
    color: '#f97316',
    bgColor: '#431407',
    icon: '🟠',
    scenarioCount: 30,
    concepts: ['Topics & Partitions', 'Consumer Groups', 'Replication', 'Exactly-Once', 'Kafka Streams'],
  },
  redis: {
    key: 'redis',
    name: 'Redis',
    tagline: 'In-memory data structure store',
    color: '#ef4444',
    bgColor: '#450a0a',
    icon: '🔴',
    scenarioCount: 30,
    concepts: ['Data Structures', 'Pub/Sub', 'Persistence', 'Cluster & Sentinel', 'Streams'],
  },
  elasticsearch: {
    key: 'elasticsearch',
    name: 'Elasticsearch',
    tagline: 'Distributed search & analytics engine',
    color: '#eab308',
    bgColor: '#422006',
    icon: '🟡',
    scenarioCount: 30,
    concepts: ['Shards & Replicas', 'Mappings & Analyzers', 'Query DSL', 'ILM', 'Aggregations'],
  },
  flink: {
    key: 'flink',
    name: 'Apache Flink',
    tagline: 'Stateful stream & batch processing',
    color: '#3b82f6',
    bgColor: '#172554',
    icon: '🔵',
    scenarioCount: 30,
    concepts: ['Windowing', 'Watermarks', 'Checkpointing', 'State Backends', 'Exactly-Once'],
  },
  rabbitmq: {
    key: 'rabbitmq',
    name: 'RabbitMQ',
    tagline: 'Open-source message broker',
    color: '#a855f7',
    bgColor: '#2e1065',
    icon: '🟣',
    scenarioCount: 30,
    concepts: ['Exchanges & Queues', 'Routing', 'Dead Letters', 'Publisher Confirms', 'Streams'],
  },
}
