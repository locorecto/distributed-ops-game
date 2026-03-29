import scenario01 from './01-backpressure'
import scenario02 from './02-tumbling-window'
import scenario03 from './03-event-time'
import scenario04 from './04-stateful-map'
import scenario05 from './05-sliding-window'
import scenario06 from './06-session-window'
import scenario07 from './07-checkpoint-failure'
import scenario08 from './08-savepoint-migration'
import scenario09 from './09-kafka-source-reset'
import scenario10 from './10-side-output'
import scenario11 from './11-async-io'
import scenario12 from './12-rocksdb-backend'
import scenario13 from './13-broadcast-state'
import scenario14 from './14-temporal-join'
import scenario15 from './15-watermark-alignment'
import scenario16 from './16-late-data'
import scenario17 from './17-task-manager-oom'
import scenario18 from './18-rescaling'
import scenario19 from './19-exactly-once-sink'
import scenario20 from './20-cep'
import scenario21 from './21-state-ttl'
import scenario22 from './22-dynamic-parallelism'
import scenario23 from './23-flink-sql-cdc'
import scenario24 from './24-temporal-join-versioned'
import scenario25 from './25-prometheus-metrics'
import scenario26 from './26-multi-sink-fanout'
import scenario27 from './27-changelog-compaction'
import scenario28 from './28-app-mode-kubernetes'
import scenario29 from './29-global-window-trigger'
import scenario30 from './30-unified-batch-stream'

export const FLINK_SCENARIOS = [
  scenario01, scenario02, scenario03, scenario04, scenario05,
  scenario06, scenario07, scenario08, scenario09, scenario10,
  scenario11, scenario12, scenario13, scenario14, scenario15,
  scenario16, scenario17, scenario18, scenario19, scenario20,
  scenario21, scenario22, scenario23, scenario24, scenario25,
  scenario26, scenario27, scenario28, scenario29, scenario30,
]
