import scenario01 from './01-queue-overflow'
import scenario02 from './02-direct-exchange'
import scenario03 from './03-fanout-broadcast'
import scenario04 from './04-topic-routing'
import scenario05 from './05-message-ttl'
import scenario06 from './06-dead-letter'
import scenario07 from './07-priority-starvation'
import scenario08 from './08-manual-ack'
import scenario09 from './09-publisher-confirms'
import scenario10 from './10-prefetch'
import scenario11 from './11-lazy-queue'
import scenario12 from './12-headers-exchange'
import scenario13 from './13-queue-mirroring'
import scenario14 from './14-shovel'
import scenario15 from './15-federation'
import scenario16 from './16-vhost-isolation'
import scenario17 from './17-memory-alarm'
import scenario18 from './18-disk-alarm'
import scenario19 from './19-quorum-election'
import scenario20 from './20-classic-quorum-migration'
import scenario21 from './21-split-brain'
import scenario22 from './22-connection-storm'
import scenario23 from './23-oauth2'
import scenario24 from './24-rate-limiting'
import scenario25 from './25-consistent-hash'
import scenario26 from './26-stream-queue-throughput'
import scenario27 from './27-stream-offset-replay'
import scenario28 from './28-delayed-message'
import scenario29 from './29-multi-az-cluster'
import scenario30 from './30-cross-protocol'

export const RABBITMQ_SCENARIOS = [
  scenario01, scenario02, scenario03, scenario04, scenario05,
  scenario06, scenario07, scenario08, scenario09, scenario10,
  scenario11, scenario12, scenario13, scenario14, scenario15,
  scenario16, scenario17, scenario18, scenario19, scenario20,
  scenario21, scenario22, scenario23, scenario24, scenario25,
  scenario26, scenario27, scenario28, scenario29, scenario30,
]
