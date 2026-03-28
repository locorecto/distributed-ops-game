interface ConnectionLineProps {
  fromX: number
  fromY: number
  toX: number
  toY: number
  color?: string
  animated?: boolean
}

export function ConnectionLine({ fromX, fromY, toX, toY, color = '#475569', animated = false }: ConnectionLineProps) {
  const mx = (fromX + toX) / 2
  const path = `M ${fromX} ${fromY} C ${mx} ${fromY}, ${mx} ${toY}, ${toX} ${toY}`
  const id = `arrow-${Math.round(fromX)}-${Math.round(toX)}`

  return (
    <g>
      <defs>
        <marker id={id} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 z" fill={color} opacity={0.7} />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.5}
        strokeDasharray={animated ? '4 4' : undefined}
        markerEnd={`url(#${id})`}
      />
    </g>
  )
}
