import { motion } from 'framer-motion'
import type { BrokerState } from '../../engine/types'
import { COLORS } from '../../constants/colors'
import { formatBytes } from '../../utils/formatters'

interface BrokerNodeProps {
  broker: BrokerState
  x: number
  y: number
  onClick?: () => void
  selected?: boolean
}

export function BrokerNode({ broker, x, y, onClick, selected }: BrokerNodeProps) {
  const color = !broker.isOnline
    ? COLORS.broker.offline
    : broker.cpuPercent > 80
    ? COLORS.broker.degraded
    : broker.isController
    ? COLORS.broker.controller
    : COLORS.broker.online

  const diskPct = (broker.diskUsedBytes / broker.config.diskCapacityBytes) * 100

  return (
    <motion.div
      className="absolute cursor-pointer select-none"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      animate={{ opacity: broker.isOnline ? 1 : 0.5, scale: broker.isOnline ? 1 : 0.95 }}
      onClick={onClick}
    >
      <div
        className="w-24 rounded-lg p-2 text-center"
        style={{
          backgroundColor: '#1e293b',
          border: `2px solid ${selected ? '#3b82f6' : color + '66'}`,
          boxShadow: broker.isController ? `0 0 8px ${COLORS.broker.controller}44` : undefined,
        }}
      >
        <div className="text-xs font-mono" style={{ color }}>
          {broker.isController ? 'CONTROLLER' : 'BROKER'}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">#{broker.config.id}</div>

        {/* Disk bar */}
        <div className="mt-2">
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-slate-500">disk</span>
            <span className="font-mono text-slate-400">{Math.round(diskPct)}%</span>
          </div>
          <div className="w-full h-1 rounded bg-slate-700">
            <div
              className="h-1 rounded transition-all duration-500"
              style={{
                width: `${Math.min(100, diskPct)}%`,
                backgroundColor: diskPct > 85 ? COLORS.health.red : diskPct > 60 ? COLORS.health.yellow : COLORS.health.green,
              }}
            />
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-1">
          {broker.partitionsLeading.length}P lead
        </div>

        {!broker.isOnline && (
          <div className="mt-1 text-xs font-bold" style={{ color: COLORS.broker.offline }}>
            OFFLINE
          </div>
        )}
      </div>
    </motion.div>
  )
}
