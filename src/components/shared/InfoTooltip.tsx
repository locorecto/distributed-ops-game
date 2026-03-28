import { useState, useRef } from 'react'

export function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLSpanElement>(null)

  const handleEnter = () => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.top, left: rect.left + rect.width / 2 })
    setVisible(true)
  }

  return (
    <span
      ref={btnRef}
      className="inline-flex items-center ml-1 cursor-help align-middle"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-600 text-slate-400 font-bold select-none"
        style={{ fontSize: 9, lineHeight: 1 }}
      >
        ?
      </span>
      {visible && (
        <span
          className="fixed w-56 rounded text-slate-200 text-xs p-2 leading-relaxed shadow-xl whitespace-normal pointer-events-none"
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #475569',
            top: pos.top,
            left: pos.left,
            transform: 'translateX(-50%) translateY(calc(-100% - 8px))',
            zIndex: 9999,
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
