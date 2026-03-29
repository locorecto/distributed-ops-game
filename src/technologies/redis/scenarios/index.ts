import scenario01 from './01-session-cache-miss'
import scenario02 from './02-leaderboard-sort'
import scenario03 from './03-shopping-cart'
import scenario04 from './04-rate-limiter'
import scenario05 from './05-pubsub-fanout'
import scenario06 from './06-task-queue'
import scenario07 from './07-cache-stampede'
import scenario08 from './08-inventory-atomic'
import scenario09 from './09-bloom-filter'
import scenario10 from './10-geospatial'
import scenario11 from './11-rdb-snapshot'
import scenario12 from './12-aof-rewrite'
import scenario13 from './13-memory-eviction'
import scenario14 from './14-streams-consumer-group'
import scenario15 from './15-keyspace-notifications'
import scenario16 from './16-lua-script'
import scenario17 from './17-pipeline-throughput'
import scenario18 from './18-sentinel-failover'
import scenario19 from './19-cluster-resharding'
import scenario20 from './20-hot-key'
import scenario21 from './21-redlock'
import scenario22 from './22-replica-lag'
import scenario23 from './23-connection-exhaustion'
import scenario24 from './24-large-value'
import scenario25 from './25-timeseries'
import scenario26 from './26-redisearch'
import scenario27 from './27-transaction-isolation'
import scenario28 from './28-cluster-brain-split'
import scenario29 from './29-acl-security'
import scenario30 from './30-active-active-geo'

export const REDIS_SCENARIOS = [
  scenario01, scenario02, scenario03, scenario04, scenario05,
  scenario06, scenario07, scenario08, scenario09, scenario10,
  scenario11, scenario12, scenario13, scenario14, scenario15,
  scenario16, scenario17, scenario18, scenario19, scenario20,
  scenario21, scenario22, scenario23, scenario24, scenario25,
  scenario26, scenario27, scenario28, scenario29, scenario30,
]
