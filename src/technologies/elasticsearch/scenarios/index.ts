import scenario01 from './01-unassigned-shards'
import scenario02 from './02-index-not-found'
import scenario03 from './03-slow-query'
import scenario04 from './04-mapping-conflict'
import scenario05 from './05-over-sharding'
import scenario06 from './06-relevance-tuning'
import scenario07 from './07-analyzer-mismatch'
import scenario08 from './08-nested-query'
import scenario09 from './09-aggregation-oom'
import scenario10 from './10-index-template'
import scenario11 from './11-reindex-performance'
import scenario12 from './12-disk-watermark'
import scenario13 from './13-split-brain'
import scenario14 from './14-alias-rollover'
import scenario15 from './15-ingest-pipeline'
import scenario16 from './16-ilm-policy'
import scenario17 from './17-ccr'
import scenario18 from './18-snapshot-restore'
import scenario19 from './19-deep-pagination'
import scenario20 from './20-circuit-breaker'
import scenario21 from './21-security-roles'
import scenario22 from './22-watcher-latency'
import scenario23 from './23-eql-sequence'
import scenario24 from './24-ml-anomaly'
import scenario25 from './25-runtime-fields'
import scenario26 from './26-async-search'
import scenario27 from './27-percolator'
import scenario28 from './28-geo-shape'
import scenario29 from './29-transform-pivot'
import scenario30 from './30-cross-cluster-search'

export const ES_SCENARIOS = [
  scenario01, scenario02, scenario03, scenario04, scenario05,
  scenario06, scenario07, scenario08, scenario09, scenario10,
  scenario11, scenario12, scenario13, scenario14, scenario15,
  scenario16, scenario17, scenario18, scenario19, scenario20,
  scenario21, scenario22, scenario23, scenario24, scenario25,
  scenario26, scenario27, scenario28, scenario29, scenario30,
]
