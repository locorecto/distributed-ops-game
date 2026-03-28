import type { SimulationEngine } from '../../engine/SimulationEngine'
import type { SimulationSnapshot } from '../../engine/types'
import { Button } from '../shared/Button'
import { ProgressBar } from '../shared/ProgressBar'
import { COLORS } from '../../constants/colors'
import { useUIStore } from '../../store/uiStore'
import { formatBytes } from '../../utils/formatters'

interface BrokerConfigPanelProps {
  engine: SimulationEngine
  snapshot: SimulationSnapshot
}

export function BrokerConfigPanel({ engine, snapshot }: BrokerConfigPanelProps) {
  const brokers = Array.from(snapshot.brokers.values())
  const { showToast } = useUIStore()

  return (
    <div className="flex flex-col gap-3">
      {brokers.map(broker => {
        const diskPct = (broker.diskUsedBytes / broker.config.diskCapacityBytes) * 100
        const color = !broker.isOnline ? COLORS.broker.offline : broker.isController ? COLORS.broker.controller : COLORS.broker.online
        return (
          <div key={broker.config.id} className="rounded p-2 border border-slate-700">
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-xs font-mono" style={{ color }}>Broker #{broker.config.id}</span>
                {broker.isController && <span className="ml-1 text-xs text-indigo-400">controller</span>}
              </div>
              <Button
                size="sm"
                variant={broker.isOnline ? 'danger' : 'secondary'}
                onClick={() => {
                  engine.toggleBroker(broker.config.id)
                  showToast(`Broker #${broker.config.id} ${broker.isOnline ? 'taken offline' : 'brought online'}`, broker.isOnline ? 'warning' : 'success')
                }}
              >
                {broker.isOnline ? 'Take Offline' : 'Bring Online'}
              </Button>
            </div>
            <div className="text-xs text-slate-500 mb-1">Disk</div>
            <ProgressBar
              value={diskPct}
              color={diskPct > 85 ? COLORS.health.red : diskPct > 60 ? COLORS.health.yellow : COLORS.health.green}
              height={6}
              showLabel
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>{formatBytes(broker.diskUsedBytes)}</span>
              <span>{formatBytes(broker.config.diskCapacityBytes)}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Leading: {broker.partitionsLeading.length} partitions
            </div>
          </div>
        )
      })}
    </div>
  )
}
