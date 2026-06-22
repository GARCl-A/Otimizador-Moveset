// Gráficos em SVG puro (sem dependência nova) para a aba Experimentos.
// Cada gráfico tem um id para permitir exportar o SVG (ver chartUtils.baixarSvg).

const FONT = 'monospace'
const AXIS = '#888'
const TEXT = '#ccc'
const GRID = '#333'

interface Margins {
  l: number
  r: number
  t: number
  b: number
}

function niceBounds(min: number, max: number): [number, number] {
  if (min === max) return [Math.min(0, min), max + 1]
  const pad = (max - min) * 0.08
  return [min - pad, max + pad]
}

// ---------------------------------------------------------------- Boxplot
export interface BoxSeries {
  label: string
  color: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  points?: number[]
}

export function Boxplot({
  id,
  series,
  width = 540,
  height = 320,
  title,
  yLabel,
}: {
  id: string
  series: BoxSeries[]
  width?: number
  height?: number
  title?: string
  yLabel?: string
}) {
  const m: Margins = { l: 52, r: 16, t: title ? 28 : 14, b: 46 }
  const pw = width - m.l - m.r
  const ph = height - m.t - m.b
  const allVals = series.flatMap(s => [s.min, s.max, ...(s.points ?? [])])
  const [yMin, yMax] = niceBounds(Math.min(...allVals, 0), Math.max(...allVals, 1))
  const y = (v: number) => m.t + ph * (1 - (v - yMin) / (yMax - yMin))
  const band = pw / Math.max(series.length, 1)
  const boxW = Math.min(60, band * 0.5)

  const ticks = 5
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks)

  return (
    <svg id={id} width={width} height={height} style={{ background: '#16161c', borderRadius: 6 }}>
      {title && <text x={m.l} y={16} fill={TEXT} fontFamily={FONT} fontSize={13}>{title}</text>}
      {yLabel && (
        <text x={12} y={m.t + ph / 2} fill={AXIS} fontFamily={FONT} fontSize={10} transform={`rotate(-90 12 ${m.t + ph / 2})`} textAnchor="middle">{yLabel}</text>
      )}
      {tickVals.map((tv, i) => (
        <g key={i}>
          <line x1={m.l} y1={y(tv)} x2={width - m.r} y2={y(tv)} stroke={GRID} strokeWidth={1} />
          <text x={m.l - 6} y={y(tv) + 3} fill={AXIS} fontFamily={FONT} fontSize={10} textAnchor="end">{tv.toFixed(0)}</text>
        </g>
      ))}
      {series.map((s, i) => {
        const cx = m.l + band * (i + 0.5)
        return (
          <g key={s.label}>
            <line x1={cx} y1={y(s.max)} x2={cx} y2={y(s.q3)} stroke={s.color} strokeWidth={1} />
            <line x1={cx} y1={y(s.min)} x2={cx} y2={y(s.q1)} stroke={s.color} strokeWidth={1} />
            <line x1={cx - boxW / 3} y1={y(s.max)} x2={cx + boxW / 3} y2={y(s.max)} stroke={s.color} strokeWidth={1} />
            <line x1={cx - boxW / 3} y1={y(s.min)} x2={cx + boxW / 3} y2={y(s.min)} stroke={s.color} strokeWidth={1} />
            <rect x={cx - boxW / 2} y={y(s.q3)} width={boxW} height={Math.max(1, y(s.q1) - y(s.q3))} fill={`${s.color}33`} stroke={s.color} strokeWidth={1.5} />
            <line x1={cx - boxW / 2} y1={y(s.median)} x2={cx + boxW / 2} y2={y(s.median)} stroke={s.color} strokeWidth={2} />
            {(s.points ?? []).map((p, j) => (
              <circle key={j} cx={cx + (((j * 2654435761) % 1000) / 1000 - 0.5) * boxW * 0.7} cy={y(p)} r={1.6} fill={`${s.color}aa`} />
            ))}
            <text x={cx} y={height - m.b + 16} fill={TEXT} fontFamily={FONT} fontSize={11} textAnchor="middle">{s.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------- BarChart
export function BarChart({
  id,
  bars,
  width = 540,
  height = 280,
  title,
  yLabel,
  valueFormat = v => v.toFixed(1),
}: {
  id: string
  bars: { label: string; value: number; color: string }[]
  width?: number
  height?: number
  title?: string
  yLabel?: string
  valueFormat?: (v: number) => string
}) {
  const m: Margins = { l: 56, r: 16, t: title ? 28 : 14, b: 46 }
  const pw = width - m.l - m.r
  const ph = height - m.t - m.b
  const yMax = Math.max(...bars.map(b => b.value), 1) * 1.1
  const y = (v: number) => m.t + ph * (1 - v / yMax)
  const band = pw / Math.max(bars.length, 1)
  const barW = Math.min(60, band * 0.55)
  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (yMax * i) / ticks)

  return (
    <svg id={id} width={width} height={height} style={{ background: '#16161c', borderRadius: 6 }}>
      {title && <text x={m.l} y={16} fill={TEXT} fontFamily={FONT} fontSize={13}>{title}</text>}
      {yLabel && (
        <text x={12} y={m.t + ph / 2} fill={AXIS} fontFamily={FONT} fontSize={10} transform={`rotate(-90 12 ${m.t + ph / 2})`} textAnchor="middle">{yLabel}</text>
      )}
      {tickVals.map((tv, i) => (
        <g key={i}>
          <line x1={m.l} y1={y(tv)} x2={width - m.r} y2={y(tv)} stroke={GRID} strokeWidth={1} />
          <text x={m.l - 6} y={y(tv) + 3} fill={AXIS} fontFamily={FONT} fontSize={10} textAnchor="end">{valueFormat(tv)}</text>
        </g>
      ))}
      {bars.map((b, i) => {
        const cx = m.l + band * (i + 0.5)
        return (
          <g key={b.label}>
            <rect x={cx - barW / 2} y={y(b.value)} width={barW} height={Math.max(0, y(0) - y(b.value))} fill={`${b.color}aa`} stroke={b.color} strokeWidth={1.5} />
            <text x={cx} y={y(b.value) - 4} fill={TEXT} fontFamily={FONT} fontSize={10} textAnchor="middle">{valueFormat(b.value)}</text>
            <text x={cx} y={height - m.b + 16} fill={TEXT} fontFamily={FONT} fontSize={11} textAnchor="middle">{b.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------- Scatter
export function Scatter({
  id,
  points,
  width = 380,
  height = 360,
  title,
  xLabel = 'exato',
  yLabel = 'previsto',
}: {
  id: string
  points: { x: number; y: number }[]
  width?: number
  height?: number
  title?: string
  xLabel?: string
  yLabel?: string
}) {
  const m: Margins = { l: 48, r: 16, t: title ? 28 : 14, b: 40 }
  const pw = width - m.l - m.r
  const ph = height - m.t - m.b
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const lo = Math.min(...xs, ...ys, 0)
  const hi = Math.max(...xs, ...ys, 1)
  const [bMin, bMax] = niceBounds(lo, hi)
  const sx = (v: number) => m.l + pw * ((v - bMin) / (bMax - bMin))
  const sy = (v: number) => m.t + ph * (1 - (v - bMin) / (bMax - bMin))

  return (
    <svg id={id} width={width} height={height} style={{ background: '#16161c', borderRadius: 6 }}>
      {title && <text x={m.l} y={16} fill={TEXT} fontFamily={FONT} fontSize={13}>{title}</text>}
      <rect x={m.l} y={m.t} width={pw} height={ph} fill="none" stroke={GRID} />
      <line x1={sx(bMin)} y1={sy(bMin)} x2={sx(bMax)} y2={sy(bMax)} stroke={AXIS} strokeDasharray="4 3" strokeWidth={1} />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2} fill="#ef4444aa" />
      ))}
      <text x={m.l + pw / 2} y={height - 8} fill={AXIS} fontFamily={FONT} fontSize={10} textAnchor="middle">{xLabel}</text>
      <text x={12} y={m.t + ph / 2} fill={AXIS} fontFamily={FONT} fontSize={10} transform={`rotate(-90 12 ${m.t + ph / 2})`} textAnchor="middle">{yLabel}</text>
    </svg>
  )
}

// ---------------------------------------------------------------- LineChart
export function LineChart({
  id,
  series,
  width = 540,
  height = 300,
  title,
  xLabel = 'época',
  yLabel = 'loss',
}: {
  id: string
  series: { label: string; color: string; data: number[] }[]
  width?: number
  height?: number
  title?: string
  xLabel?: string
  yLabel?: string
}) {
  const m: Margins = { l: 56, r: 90, t: title ? 28 : 14, b: 40 }
  const pw = width - m.l - m.r
  const ph = height - m.t - m.b
  const allY = series.flatMap(s => s.data)
  const maxLen = Math.max(...series.map(s => s.data.length), 1)
  const [yMin, yMax] = niceBounds(Math.min(...allY, 0), Math.max(...allY, 1))
  const x = (i: number) => m.l + pw * (maxLen <= 1 ? 0 : i / (maxLen - 1))
  const y = (v: number) => m.t + ph * (1 - (v - yMin) / (yMax - yMin))
  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticks)

  return (
    <svg id={id} width={width} height={height} style={{ background: '#16161c', borderRadius: 6 }}>
      {title && <text x={m.l} y={16} fill={TEXT} fontFamily={FONT} fontSize={13}>{title}</text>}
      {tickVals.map((tv, i) => (
        <g key={i}>
          <line x1={m.l} y1={y(tv)} x2={m.l + pw} y2={y(tv)} stroke={GRID} strokeWidth={1} />
          <text x={m.l - 6} y={y(tv) + 3} fill={AXIS} fontFamily={FONT} fontSize={10} textAnchor="end">{tv.toFixed(2)}</text>
        </g>
      ))}
      {series.map((s, si) => (
        <g key={s.label}>
          <polyline
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
          <rect x={m.l + pw + 12} y={m.t + si * 18} width={10} height={10} fill={s.color} />
          <text x={m.l + pw + 26} y={m.t + si * 18 + 9} fill={TEXT} fontFamily={FONT} fontSize={10}>{s.label}</text>
        </g>
      ))}
      <text x={m.l + pw / 2} y={height - 8} fill={AXIS} fontFamily={FONT} fontSize={10} textAnchor="middle">{xLabel}</text>
      <text x={12} y={m.t + ph / 2} fill={AXIS} fontFamily={FONT} fontSize={10} transform={`rotate(-90 12 ${m.t + ph / 2})`} textAnchor="middle">{yLabel}</text>
    </svg>
  )
}
