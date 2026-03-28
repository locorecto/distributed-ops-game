import { motion } from 'framer-motion'
import type { ConsumerState } from '../../engine/types'
import { COLORS } from '../../constants/colors'
import { formatNumber } from '../../utils/formatters'

interface ConsumerNodeProps {
  consumer: ConsumerState
  x: number
  y: number
  onClick?: () => void
  selected?: boolean
}

export function ConsumerNode({ consumer, x, y, onClick, selected }: ConsumerNodeProps) {
  let color: string = COLORS.consumer.active
  if (!consumer.isActive) color = COLORS.consumer.crashed
  else if (consumer.lag > 100) color = COLORS.consumer.lagging

  const groupState = consumer.isActive ? 'active' : 'crashed'

  return (
    <motion.div
      className="absolute cursor-pointer select-none"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: consumer.isActive ? 1 : 0.95 }}
      onClick={onClick}
    >
      <div
        className="w-28 rounded-lg p-2"
        style={{
          backgroundColor: '#1e293b',
          border: `2px solid ${selected ? '#3b82f6' : color + '66'}`,
          boxShadow: selected ? `0 0 12px #3b82f644` : undefined,
          opacity: consumer.isActive ? 1 : 0.6,
        }}
      >
        <div className="text-xs font-mono mb-1 text-center" style={{ color }}>
          CONSUMER
        </div>
        <div className="text-xs text-slate-300 truncate text-center" title={consumer.config.id}>
          {consumer.config.id.replace('consumer-', '')}
        </div>
        <div className="text-xs text-slate-500 text-center">{consumer.config.groupId}</div>

        {/* Lag meter */}
        <div className="mt-2">
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-slate-500">lag</span>
            <span className="font-mono" style={{ color: consumer.lag > 200 ? COLORS.health.red : consumer.lag > 50 ? COLORS.health.yellow : COLORS.health.green }}>
              {formatNumber(consumer.lag)}
            </span>
          </div>
          <div className="w-full h-1 rounded bg-slate-700">
            <div
              className="h-1 rounded transition-all duration-300"
              style={{
                width: `${Math.min(100, (consumer.lag / 1000) * 100)}%`,
                backgroundColor: consumer.lag > 200 ? COLORS.health.red : consumer.lag > 50 ? COLORS.health.yellow : COLORS.health.green,
              }}
            />
          </div>
        </div>

        {!consumer.isActive && (
          <div className="mt-1 text-center text-xs" style={{ color: COLORS.consumer.crashed }}>
            CRASHED
          </div>
        )}

        {consumer.config.dlqEnabled && consumer.dlqMessages.length > 0 && (
          <div className="mt-1 text-center text-xs text-red-400">
            DLQ: {consumer.dlqMessages.length}
          </div>
        )}
      </div>
    </motion.div>
  )
}
