import scenario01 from './01-pizza-order'
import scenario02 from './02-flash-sale'
import scenario03 from './03-ride-sharing'
import scenario04 from './04-chat-fanout'
import scenario05 from './05-iot-sensors'
import scenario06 from './06-stock-market'
import scenario07 from './07-payment-gateway'
import scenario08 from './08-log-aggregation'
import scenario09 from './09-ecommerce-pipeline'
import scenario10 from './10-audit-log'
import scenario11 from './11-analytics-dashboard'
import scenario12 from './12-video-streaming'
import scenario13 from './13-supply-chain'
import scenario14 from './14-gaming-leaderboard'
import scenario15 from './15-healthcare-monitor'
import scenario16 from './16-microservices-bus'
import scenario17 from './17-database-cdc'
import scenario18 from './18-fraud-detection'
import scenario19 from './19-schema-registry'
import scenario20 from './20-multi-dc-dr'
import scenario21 from './21-log-compaction-deep-dive'
import scenario22 from './22-consumer-rebalance-storm'
import scenario23 from './23-quota-throttling'
import scenario24 from './24-kafka-connect-jdbc-sink'
import scenario25 from './25-debezium-cdc-source'
import scenario26 from './26-schema-forward-compat'
import scenario27 from './27-partition-leader-imbalance'
import scenario28 from './28-active-active-geo-replication'
import scenario29 from './29-acl-sasl-security'
import scenario30 from './30-multi-tenant-cluster'

export const SCENARIOS = [
  scenario01, scenario02, scenario03, scenario04, scenario05,
  scenario06, scenario07, scenario08, scenario09, scenario10,
  scenario11, scenario12, scenario13, scenario14, scenario15,
  scenario16, scenario17, scenario18, scenario19, scenario20,
  scenario21, scenario22, scenario23, scenario24, scenario25,
  scenario26, scenario27, scenario28, scenario29, scenario30,
]

export const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#22c55e',
  easy: '#4ade80',
  medium: '#facc15',
  'medium-hard': '#fb923c',
  hard: '#f87171',
  expert: '#c084fc',
  master: '#e879f9',
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  easy: 'Easy',
  medium: 'Medium',
  'medium-hard': 'Medium-Hard',
  hard: 'Hard',
  expert: 'Expert',
  master: 'Master',
}
