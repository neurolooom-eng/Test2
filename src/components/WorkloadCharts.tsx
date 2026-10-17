import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { formatHours, formatPercent } from '../format'
import type { MonthlyHours, StreamSummary } from '../capacity'
import { barPath, columnPath, compactNumber, longMonth, monthTick, niceTicks, useElementWidth, type EpicColors } from '../chartUtils'

// Combination charts share ONE unit per plot (never a second y-axis): utilization bars + planned-utilization line
// are both %, Epic stacks + available line are both hours. Marks carry series colour; all text wears text tokens.

function LegendBar({ color, label }: { color: string; label: string }) { return <li><i className="viz-key-bar" style={{ background: color }} aria-hidden="true" />{label}</li> }
function LegendLine({ color, label }: { color: string; label: string }) { return <li><i style={{ background: color }} aria-hidden="true" />{label}</li> }
function LegendTick({ label }: { label: string }) { return <li><i className="viz-key-tick" aria-hidden="true" />{label}</li> }

function ChartFrame({ legend, table, setTable, children }: { legend: ReactNode; table: boolean; setTable: (value: boolean) => void; children: ReactNode }) {
  return <div className="viz-root">
    <div className="viz-toolbar"><ul className="viz-legend" aria-label="Legend">{legend}</ul><button type="button" className="ghost" aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'Chart' : 'Table'}</button></div>
    {children}
  </div>
}

function Tooltip({ left, top = 8, width, children }: { left: number; top?: number; width: number; children: ReactNode }) {
  return <div className="viz-tooltip" role="status" style={{ left: Math.min(width - 96, Math.max(96, left)), top }}>{children}</div>
}

function TooltipRow({ color, value, label }: { color: string; value: string; label: string }) {
  return <div><i style={{ background: color }} aria-hidden="true" /><b>{value}</b><span>{label}</span></div>
}

// Month-axis keyboard: ←/→ move the readout, Enter selects that month, Esc clears.
function monthKeys(event: KeyboardEvent<SVGSVGElement>, count: number, active: number, setHover: (index: number | null) => void, select: () => void) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover(Math.min(count - 1, Math.max(0, active + (event.key === 'ArrowLeft' ? -1 : 1)))) }
  else if (event.key === 'Enter') select()
  else if (event.key === 'Escape') setHover(null)
}

function MonthAxis({ series, selected, x, y, band }: { series: MonthlyHours[]; selected: string; x: (index: number) => number; y: number; band: number }) {
  const step = band < 34 ? 2 : 1
  return <>{series.map((point, index) => (index % step === 0 || point.month === selected) && <text key={point.month} className={`viz-tick ${point.month === selected ? 'viz-tick-selected' : ''}`} x={x(index)} y={y} textAnchor="middle">{monthTick(point.month, index)}</text>)}</>
}

export function UtilizationChart({ series, selected, onSelect, overloadedAt, availableBelow }: { series: MonthlyHours[]; selected: string; onSelect?: (month: string) => void; overloadedAt: number; availableBelow: number }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const height = 280, pad = { top: 22, right: 122, bottom: 34, left: 46 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const values = series.flatMap((point) => [point.utilization, point.plannedUtilization]).filter((value): value is number => value != null)
  const ticks = niceTicks(Math.max(overloadedAt * 1.1, ...values))
  const top = ticks[ticks.length - 1]
  const band = plotWidth / Math.max(1, series.length)
  const x = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - Math.min(value, top) / top * plotHeight
  const barWidth = Math.min(24, band * 0.55)
  const selectedIndex = series.findIndex((point) => point.month === selected)
  const active = hover ?? (selectedIndex >= 0 ? selectedIndex : series.length - 1)
  const current = series[active]
  const indexAt = (event: PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return Math.min(series.length - 1, Math.max(0, Math.floor((event.clientX - rect.left - pad.left) / band))) }
  const line = series.map((point, index) => point.plannedUtilization == null ? null : `${index === 0 || series[index - 1].plannedUtilization == null ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.plannedUtilization).toFixed(1)}`).filter(Boolean).join(' ')
  const references = [{ value: overloadedAt, label: `Overloaded ≥ ${overloadedAt}%` }, { value: availableBelow, label: `Capacity < ${availableBelow}%` }]
  const legend = <><LegendBar color="var(--viz-series-1)" label="Actual utilization" /><LegendLine color="var(--viz-series-2)" label="Planned utilization" /></>
  return <ChartFrame legend={legend} table={table} setTable={setTable}><div ref={wrap}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>Month</th><th>Actual utilization</th><th>Planned utilization</th><th>Booked (h)</th><th>Planned (h)</th><th>Available (h)</th></tr></thead><tbody>{series.map((point) => <tr key={point.month} className={point.month === selected ? 'matrix-total' : ''}><td>{longMonth(point.month)}</td><td>{formatPercent(point.utilization)}</td><td>{formatPercent(point.plannedUtilization)}</td><td>{formatHours(point.actual)}</td><td>{formatHours(point.planned)}</td><td>{formatHours(point.available)}</td></tr>)}</tbody></table></div>
    : <div className="viz-plot">
      <svg className="viz-fixed" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onPointerMove={(event) => setHover(indexAt(event))} onPointerLeave={() => setHover(null)} onKeyDown={(event) => monthKeys(event, series.length, active, setHover, () => current && onSelect?.(current.month))} onClick={() => current && onSelect?.(current.month)}>
        <title id={`${id}-title`}>Actual and planned utilization per month, with overloaded and capacity thresholds</title>
        {ticks.map((tick) => <g key={tick}><line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(tick)} y2={y(tick)} /><text className="viz-tick" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tick}%</text></g>)}
        {selectedIndex >= 0 && <rect className="viz-selected-band" x={x(selectedIndex) - band / 2 + 2} y={pad.top} width={Math.max(4, band - 4)} height={plotHeight} rx={4} />}
        {references.map((reference) => <g key={reference.label}><line className="viz-reference" x1={pad.left} x2={pad.left + plotWidth} y1={y(reference.value)} y2={y(reference.value)} /><text className="viz-reference-label" x={pad.left + plotWidth + 8} y={y(reference.value)} dominantBaseline="middle">{reference.label}</text></g>)}
        {hover != null && <line className="viz-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotHeight} />}
        {series.map((point, index) => point.utilization == null ? null : <path key={point.month} className={`viz-bar ${index === active ? 'viz-bar-active' : ''}`} d={columnPath(x(index) - barWidth / 2, y(point.utilization), barWidth, pad.top + plotHeight - y(point.utilization))} fill="var(--viz-series-1)" />)}
        <path d={line} fill="none" stroke="var(--viz-series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) => point.plannedUtilization == null ? null : <circle key={point.month} className="viz-marker" cx={x(index)} cy={y(point.plannedUtilization)} r={index === active ? 5 : 4} fill="var(--viz-series-2)" />)}
        {current?.utilization != null && <text className="viz-value-label" x={x(active)} y={Math.max(12, Math.min(y(current.utilization), current.plannedUtilization != null ? y(current.plannedUtilization) : Infinity) - 10)} textAnchor="middle">{formatPercent(current.utilization, 0)}</text>}
        <MonthAxis series={series} selected={selected} x={x} y={height - pad.bottom + 18} band={band} />
      </svg>
      {hover != null && current && <Tooltip left={x(hover)} width={width}><strong>{longMonth(current.month)}</strong><TooltipRow color="var(--viz-series-1)" value={formatPercent(current.utilization)} label="Actual" /><TooltipRow color="var(--viz-series-2)" value={formatPercent(current.plannedUtilization)} label="Planned" /><small>{formatHours(current.actual)}h booked · {formatHours(current.available)}h available</small></Tooltip>}
    </div>}
  </div></ChartFrame>
}

export function EpicMixChart({ series, selected, onSelect, colors }: { series: MonthlyHours[]; selected: string; onSelect?: (month: string) => void; colors: EpicColors }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const height = 300, pad = { top: 18, right: 104, bottom: 34, left: 52 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const groups = [...colors.top.map((entry) => ({ key: entry.key, title: entry.title, color: entry.color })), { key: '__other', title: 'Other Epics', color: colors.other }]
  const stacks = series.map((point) => {
    const values = groups.map((group) => group.key === '__other' ? point.streams.filter((stream) => !colors.isTop(stream.key)).reduce((sum, stream) => sum + stream.work, 0) : point.streams.find((stream) => stream.key === group.key)?.work ?? 0)
    return { point, values, total: values.reduce((sum, value) => sum + value, 0) }
  })
  const shown = stacks.some((stack) => stack.values[groups.length - 1] > 0) ? groups : groups.slice(0, -1)
  const ticks = niceTicks(Math.max(1, ...stacks.map((stack) => Math.max(stack.total, stack.point.available ?? 0))))
  const top = ticks[ticks.length - 1]
  const band = plotWidth / Math.max(1, series.length)
  const x = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - value / top * plotHeight
  const barWidth = Math.min(24, band * 0.55)
  const selectedIndex = series.findIndex((point) => point.month === selected)
  const active = hover ?? (selectedIndex >= 0 ? selectedIndex : series.length - 1)
  const current = stacks[active]
  const indexAt = (event: PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return Math.min(series.length - 1, Math.max(0, Math.floor((event.clientX - rect.left - pad.left) / band))) }
  const available = series.map((point, index) => point.available == null ? null : `${index === 0 || series[index - 1].available == null ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.available).toFixed(1)}`).filter(Boolean).join(' ')
  const lastAvailable = [...series.keys()].reverse().find((index) => series[index].available != null)
  const legend = <>{shown.map((group) => <LegendBar key={group.key} color={group.color} label={group.title} />)}<LegendLine color="var(--viz-capacity)" label="Available hours" /></>
  return <ChartFrame legend={legend} table={table} setTable={setTable}><div ref={wrap}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>Month</th>{shown.map((group) => <th key={group.key}>{group.title}</th>)}<th>Booked (h)</th><th>Available (h)</th></tr></thead><tbody>{stacks.map((stack) => <tr key={stack.point.month} className={stack.point.month === selected ? 'matrix-total' : ''}><td>{longMonth(stack.point.month)}</td>{shown.map((group, index) => <td key={group.key}>{stack.values[index] ? formatHours(stack.values[index]) : '·'}</td>)}<td>{stack.point.actual == null ? '—' : formatHours(stack.total)}</td><td>{formatHours(stack.point.available)}</td></tr>)}</tbody></table></div>
    : <div className="viz-plot">
      <svg className="viz-fixed" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onPointerMove={(event) => setHover(indexAt(event))} onPointerLeave={() => setHover(null)} onKeyDown={(event) => monthKeys(event, series.length, active, setHover, () => current && onSelect?.(current.point.month))} onClick={() => current && onSelect?.(current.point.month)}>
        <title id={`${id}-title`}>Booked hours per Epic stacked by month, with available hours</title>
        {ticks.map((tick) => <g key={tick}><line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(tick)} y2={y(tick)} /><text className="viz-tick" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{compactNumber(tick)}</text></g>)}
        {selectedIndex >= 0 && <rect className="viz-selected-band" x={x(selectedIndex) - band / 2 + 2} y={pad.top} width={Math.max(4, band - 4)} height={plotHeight} rx={4} />}
        {hover != null && <line className="viz-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotHeight} />}
        {stacks.map((stack, index) => {
          const last = stack.values.findLastIndex((value) => value > 0)
          let below = 0
          return <g key={stack.point.month} className={`viz-bar ${index === active ? 'viz-bar-active' : ''}`}>{stack.values.map((value, groupIndex) => {
            if (value <= 0) return null
            const bottom = y(below), topEdge = y(below + value), gap = below > 0 ? 2 : 0
            below += value
            const segmentHeight = Math.max(0, bottom - topEdge - gap)
            if (segmentHeight <= 0) return null
            return groupIndex === last
              ? <path key={groups[groupIndex].key} d={columnPath(x(index) - barWidth / 2, topEdge, barWidth, segmentHeight)} fill={groups[groupIndex].color} />
              : <rect key={groups[groupIndex].key} x={x(index) - barWidth / 2} y={topEdge} width={barWidth} height={segmentHeight} fill={groups[groupIndex].color} />
          })}</g>
        })}
        <path d={available} fill="none" stroke="var(--viz-capacity)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) => point.available == null ? null : <circle key={point.month} className="viz-marker" cx={x(index)} cy={y(point.available)} r={index === active ? 5 : 4} fill="var(--viz-capacity)" />)}
        {lastAvailable != null && <text className="viz-end-label" x={pad.left + plotWidth + 10} y={y(series[lastAvailable].available!)} dominantBaseline="middle">{formatHours(series[lastAvailable].available)}<tspan className="viz-muted" x={pad.left + plotWidth + 10} dy={15}>available</tspan></text>}
        <MonthAxis series={series} selected={selected} x={x} y={height - pad.bottom + 18} band={band} />
      </svg>
      {hover != null && current && <Tooltip left={x(hover)} width={width}><strong>{longMonth(current.point.month)}</strong><TooltipRow color="var(--viz-capacity)" value={`${formatHours(current.point.available)} h`} label="Available" /><TooltipRow color="var(--text-3)" value={current.point.actual == null ? '—' : `${formatHours(current.total)} h`} label="Booked" />{shown.map((group, index) => current.values[index] > 0 && <TooltipRow key={group.key} color={group.color} value={`${formatHours(current.values[index])} h`} label={group.title} />)}</Tooltip>}
    </div>}
  </div></ChartFrame>
}

export function EpicBulletChart({ streams, colors }: { streams: StreamSummary[]; colors: EpicColors }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const rowHeight = 34, barHeight = 16
  const pad = { top: 6, right: 104, bottom: 30, left: 124 }
  const height = pad.top + streams.length * rowHeight + pad.bottom
  const plotWidth = Math.max(10, width - pad.left - pad.right)
  const ticks = niceTicks(Math.max(1, ...streams.flatMap((stream) => [stream.work, stream.planned])), Math.max(2, Math.min(5, Math.floor(plotWidth / 90))))
  const top = ticks[ticks.length - 1]
  const x = (value: number) => pad.left + value / top * plotWidth
  const rowY = (index: number) => pad.top + index * rowHeight + (rowHeight - barHeight) / 2
  const current = hover == null ? undefined : streams[hover]
  const keyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setHover((value) => Math.min(streams.length - 1, Math.max(0, (value ?? -1) + (event.key === 'ArrowUp' ? -1 : 1)))) }
    else if (event.key === 'Escape') setHover(null)
  }
  const legend = <><LegendBar color="var(--text-3)" label="Booked hours (Epic colour)" /><LegendTick label="Planned hours" /></>
  return <ChartFrame legend={legend} table={table} setTable={setTable}><div ref={wrap}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>Epic</th><th>Booked (h)</th><th>Planned (h)</th><th>Variance (h)</th><th>Share</th><th>People</th></tr></thead><tbody>{streams.map((stream) => <tr key={stream.key}><td>{stream.title}</td><td>{formatHours(stream.work)}</td><td>{formatHours(stream.planned)}</td><td>{formatHours(stream.work - stream.planned)}</td><td>{formatPercent(stream.share, 0)}</td><td>{stream.people}</td></tr>)}</tbody></table></div>
    : <div className="viz-plot">
      <svg className="viz-fixed" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onKeyDown={keyDown} onPointerLeave={() => setHover(null)}>
        <title id={`${id}-title`}>Booked and planned hours per Epic for the selected month</title>
        {ticks.map((tick) => <g key={tick}><line className="viz-grid" x1={x(tick)} x2={x(tick)} y1={pad.top} y2={height - pad.bottom} /><text className="viz-tick" x={x(tick)} y={height - pad.bottom + 18} textAnchor="middle">{compactNumber(tick)}</text></g>)}
        {streams.map((stream, index) => {
          const label = stream.title.length > 17 ? `${stream.title.slice(0, 16)}…` : stream.title
          return <g key={stream.key} onPointerEnter={() => setHover(index)}>
            <rect className={index === hover ? 'viz-row-active' : 'viz-row-hit'} x={0} y={pad.top + index * rowHeight} width={width} height={rowHeight} rx={4} />
            <text className="viz-row-label" x={pad.left - 10} y={rowY(index) + barHeight / 2} textAnchor="end" dominantBaseline="middle"><title>{stream.title}</title>{label}</text>
            <path d={barPath(pad.left, rowY(index), x(stream.work) - pad.left, barHeight)} fill={colors.colorOf(stream.key)} />
            {stream.planned > 0 && <><line className="viz-tick-ring" x1={x(stream.planned)} x2={x(stream.planned)} y1={rowY(index) - 4} y2={rowY(index) + barHeight + 4} /><line className="viz-tick-mark" x1={x(stream.planned)} x2={x(stream.planned)} y1={rowY(index) - 4} y2={rowY(index) + barHeight + 4} /></>}
            <text className="viz-end-label" x={Math.max(x(stream.work), x(stream.planned)) + 10} y={rowY(index) + barHeight / 2} dominantBaseline="middle">{formatHours(stream.work)}h<tspan className="viz-muted"> · {formatPercent(stream.share, 0)}</tspan></text>
          </g>
        })}
      </svg>
      {current && hover != null && <Tooltip left={x(current.work)} top={rowY(hover) + rowHeight} width={width}><strong>{current.title}</strong><TooltipRow color={colors.colorOf(current.key)} value={`${formatHours(current.work)} h`} label="Booked" /><TooltipRow color="var(--text)" value={`${formatHours(current.planned)} h`} label="Planned" /><small>{current.work - current.planned >= 0 ? '+' : ''}{formatHours(current.work - current.planned)}h vs plan · {current.people} people · {current.features} feature{current.features === 1 ? '' : 's'}</small></Tooltip>}
    </div>}
  </div></ChartFrame>
}
