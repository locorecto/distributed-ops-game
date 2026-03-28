import { motion } from 'framer-motion'
import type { TopicState } from '../../engine/types'
import { COLORS } from '../../constants/colors'
import { formatNumber } from '../../utils/formatters'

interface TopicNodeProps {
  topic: TopicState
  x: number
  y: number
  onClick?: () => void
  selected?: boolean
}

export function TopicNode({ topic, x, y, onClick, selected }: TopicNodeProps) {
  const partitions = Array.from(topic.partitions.values())
  const maxMessages = Math.max(...partitions.map(p => p.messages.length), 1)

  return (
    <motion.div
      className="absolute cursor-pointer select-none"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
    >
      <div
        className="rounded-lg p-2"
        style={{
          backgroundColor: '#1e293b',
          border: `2px solid ${selected ? '#3b82f6' : '#475569'}`,
          minWidth: 140,
        }}
      >
        <div className="text-xs font-mono text-slate-400 mb-1 text-center truncate" title={topic.config.name}>
          {topic.config.name}
        </div>
        <div className="flex gap-1 justify-center flex-wrap">
          {partitions.map(p => {
            const fill = Math.min(1, p.messages.length / Math.max(maxMessages, 1))
            const color = p.isHot
              ? COLORS.partition.hot
              : p.isrIds.length < topic.config.replicationFactor
              ? COLORS.partition.outOfSync
              : COLORS.partition.leader

            return (
              <div key={p.id} className="flex flex-col items-center gap-0.5">
                <div className="text-xs text-slate-500">{p.id}</div>
                <div
                  className="w-6 rounded overflow-hidden"
                  style={{ height: 32, backgroundColor: '#0f172a', border: `1px solid ${color}44` }}
                >
                  <div
                    className="w-full rounded transition-all duration-300"
                    style={{
                      height: `${fill * 100}%`,
                      backgroundColor: color,
                      marginTop: `${(1 - fill) * 100}%`,
                    }}
                  />
                </div>
                <div className="text-xs font-mono" style={{ color, fontSize: 9 }}>
                  {formatNumber(p.messages.length)}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between text-xs mt-1 text-slate-500">
          <span>RF:{topic.config.replicationFactor}</span>
          <span>{topic.config.cleanupPolicy === 'compact' ? 'compact' : `${Math.round(topic.config.retentionMs / 3600000)}h`}</span>
        </div>
      </div>
    </motion.div>
  )
}
