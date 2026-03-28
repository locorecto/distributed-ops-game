import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '../../store/uiStore'

export function ToastContainer() {
  const { toasts, dismissToast } = useUIStore()
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="pointer-events-auto px-3 py-2 rounded text-xs font-medium max-w-xs"
            style={{
              backgroundColor: t.type === 'error' ? '#7f1d1d' : t.type === 'warning' ? '#78350f' : t.type === 'success' ? '#14532d' : '#1e293b',
              border: `1px solid ${t.type === 'error' ? '#ef4444' : t.type === 'warning' ? '#f59e0b' : t.type === 'success' ? '#22c55e' : '#475569'}`,
              color: '#f8fafc',
            }}
            onClick={() => dismissToast(t.id)}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
