import { motion } from 'framer-motion'
import { COLORS } from '../../constants/colors'

interface MessageParticleProps {
  fromX: number
  fromY: number
  toX: number
  toY: number
  color?: string
  onComplete?: () => void
}

export function MessageParticle({ fromX, fromY, toX, toY, color = COLORS.message.normal, onComplete }: MessageParticleProps) {
  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full pointer-events-none"
      style={{ left: fromX, top: fromY, backgroundColor: color, zIndex: 10 }}
      animate={{ left: toX, top: toY, opacity: [1, 1, 0] }}
      transition={{ duration: 0.6, ease: 'linear' }}
      onAnimationComplete={onComplete}
    />
  )
}
