import type { TechKey } from './types'
import { SCENARIOS } from '../scenarios/index'
import { REDIS_SCENARIOS } from './redis/scenarios/index'
import { ES_SCENARIOS } from './elasticsearch/scenarios/index'
import { FLINK_SCENARIOS } from './flink/scenarios/index'
import { RABBITMQ_SCENARIOS } from './rabbitmq/scenarios/index'

export const TECH_SCENARIOS: Record<TechKey, any[]> = {
  kafka: SCENARIOS,
  redis: REDIS_SCENARIOS,
  elasticsearch: ES_SCENARIOS,
  flink: FLINK_SCENARIOS,
  rabbitmq: RABBITMQ_SCENARIOS,
}

export function getScenariosForTech(tech: TechKey): any[] {
  return TECH_SCENARIOS[tech] ?? []
}
