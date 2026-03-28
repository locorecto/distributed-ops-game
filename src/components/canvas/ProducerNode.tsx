import { motion } from 'framer-motion'
import type { ProducerState } from '../../engine/types'
import { COLORS } from '../../constants/colors'
import { formatRate } from '../../utils/formatters'

interface ProducerNodeProps {
  producer: ProducerState
  x: number
  y: number
  onClick?: () => void
  selected?: boolean
}

export function ProducerNode({ producer, x, y, onClick, selected }: ProducerNodeProps) {
  const color = producer.isHealthy ? COLORS.producer.healthy : COLORS.producer.erroring

  return (
    <motion.div
      className="absolute cursor-pointer select-none"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
    >
      <div
        className="w-24 rounded-lg p-2 text-center"
        style={{
          backgroundColor: '#1e293b',
          border: `2px solid ${selected ? '#3b82f6' : color + '66'}`,
          boxShadow: selected ? `0 0 12px ${color}44` : undefined,
        }}
      >
        <div className="text-xs font-mono mb-1" style={{ color }}>
          PRODUCER
        </div>
        <div className="text-xs text-slate-300 truncate max-w-full px-1" title={producer.config.id}>
          {producer.config.id.replace('producer-', '')}
        </div>
        <div className="text-xs font-mono mt-1" style={{ color }}>
          {formatRate(producer.sendRate)}
        </div>
        <div className="flex justify-center gap-1 mt-1">
          {producer.config.acks === -1 && <span className="text-xs text-green-400">acks=all</span>}
          {producer.config.idempotent && <span className="text-xs text-purple-400">idm</span>}
          {producer.config.transactional && <span className="text-xs text-teal-400">txn</span>}
        </div>
      </div>
    </motion.div>
  )
}
