import { useState } from 'react'
import { EmptyState, Metric, Metrics, Page, Panel, Pill, TablePanel, type Tone } from '../components/ui'
import { HoursTrendChart } from '../components/HoursTrendChart'
import { EpicBulletChart, EpicMixChart, UtilizationChart } from '../components/WorkloadCharts'
import { epicColors } from '../chartUtils'
import { AzureSourceBar } from '../components/AzureSourceBar'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { capacityModel, monthlyHours, normalizeCapacitySettings, absenceKinds, type LoadStatus } from '../capacity'
import { formatHours, formatPercent, monthName } from '../format'
import type { Page as PageId } from './registry'
import type { PageProps } from './types'

const statusTone: Record<LoadStatus, Tone> = { 'Overloaded': 'danger', 'Balanced': 'open', 'Has capacity': 'info', 'No bookings': 'neutral' }
const maxMatrixStreams = 8

export function DashboardPage({ month, azure, navigate, store, setMonth }: { month: string; azure: AzureWorkspace; navigate: (page: PageId) => void; store: PageProps['store']; setMonth?: (month: string) => void }) {
  const settings = normalizeCapacitySettings(store.state.capacitySettings)
  const model = capacityModel(azure.items, month, settings)
  const [span, setSpan] = useState<6 | 12>(12)
  const trend = monthlyHours(azure.items, month, span, settings)
  const trendTotals = trend.filter((point) => point.actual != null)
  // Epic colours come from a fixed 12-month window so switching 6/12 months never repaints an Epic.
  const colors = epicColors(span === 12 ? trend : monthlyHours(azure.items, month, 12, settings))
  const matrixStreams = model.streams.slice(0, maxMatrixStreams)
  const otherStreams = model.streams.slice(maxMatrixStreams)
  const personOther = (streams: typeof model.people[number]['streams']) => streams.filter((stream) => otherStreams.some((other) => other.key === stream.key)).reduce((sum, stream) => sum + stream.work, 0)
  return <Page>
    <AzureSourceBar azure={azure} onOpenConnection={() => navigate('azure')}><button className="ghost" onClick={() => navigate('board')}>Open Backlogs</button></AzureSourceBar>
    <Metrics>
      <Metric label="Team utilization" value={formatPercent(model.totals.utilization)} hint={`${formatHours(model.totals.work)}h booked of ${formatHours(model.totals.available)}h available`} tone={model.totals.utilization != null && model.totals.utilization >= settings.overloadedAt ? 'negative' : undefined} />
      <Metric label="Overloaded" value={model.counts.overloaded} hint={`≥ ${settings.overloadedAt}% of available hours`} tone={model.counts.overloaded ? 'negative' : undefined} />
      <Metric label="Has capacity" value={model.counts.hasCapacity} hint={`< ${settings.availableBelow}% of available hours`} tone={model.counts.hasCapacity ? 'positive' : undefined} />
      <Metric label="Absence" value={formatHours(model.totals.absence)} hint={absenceKinds.filter((kind) => model.totals.absenceByKind[kind]).map((kind) => `${kind} ${formatHours(model.totals.absenceByKind[kind])}h`).join(' · ') || `Under Epic #${settings.absenceEpicId}`} />
    </Metrics>
    <div className="viz-filters" role="group" aria-label="Months shown"><span>Months shown</span>{([6, 12] as const).map((value) => <button key={value} type="button" className={span === value ? 'primary' : 'ghost'} aria-pressed={span === value} onClick={() => setSpan(value)}>{value} months</button>)}{trendTotals.length > 0 && <span className="record-count">{trendTotals.length} month{trendTotals.length === 1 ? '' : 's'} with bookings · click a month in any chart to select it</span>}</div>
    {trendTotals.length ? <>
      <Panel className="viz-panel" title="Hours by month" detail={`Funded = people × working days × ${settings.hoursPerDay}h; available = funded − absence; actual = booked Completed Work.`}>
        <HoursTrendChart series={trend} selected={month} onSelect={setMonth} />
      </Panel>
      <div className="dashboard-grid viz-grid-2">
        <Panel className="viz-panel" title="Utilization by month" detail="Bars: actual = booked Completed Work ÷ available hours. Line: planned = Original Estimate ÷ available hours. Reference lines are the thresholds set in Administration.">
          <UtilizationChart series={trend} selected={month} onSelect={setMonth} overloadedAt={settings.overloadedAt} availableBelow={settings.availableBelow} />
        </Panel>
        <Panel className="viz-panel" title={`Hours by Epic · ${monthName(month)}`} detail="Bar = booked hours, tick = planned hours; share of the month's booked hours on the right. Absence is excluded.">
          {model.streams.length ? <EpicBulletChart streams={model.streams} colors={colors} /> : <EmptyState title="No booked hours this month." />}
        </Panel>
      </div>
      <Panel className="viz-panel" title="Epic mix by month" detail="Stacked bars: booked hours per Epic (the five largest over the last 12 months keep their colour; the rest are grouped as Other Epics). Line: available hours on the same scale.">
        <EpicMixChart series={trend} selected={month} onSelect={setMonth} colors={colors} />
      </Panel>
    </> : <Panel className="viz-panel" title="Hours by month"><EmptyState title="No Time Writing Tasks in this range." detail="Refresh from Azure or load the synthetic sample to see the trend." /></Panel>}
    <div className="dashboard-grid">
      <TablePanel title="Who has capacity" detail={`${monthName(month)} · ${model.workingDays} working days × ${settings.hoursPerDay}h = ${formatHours(model.fundedPerPerson)}h funded per person, less absence.`} count={`${model.people.length} people`} empty={model.people.length ? undefined : 'No Time Writing Tasks for this month.'}>
        <table><thead><tr><th>Person</th><th>Status</th><th>Available</th><th>Planned</th><th>Booked</th><th>Utilization</th><th>Main stream</th></tr></thead><tbody>{model.people.map((person) => <tr key={person.name}><td><strong>{person.name}</strong>{person.absence > 0 && <small>{formatHours(person.absence)}h absence</small>}</td><td><Pill tone={statusTone[person.status]}>{person.status}</Pill></td><td>{formatHours(person.available)}</td><td>{formatHours(person.planned)}</td><td>{formatHours(person.work)}</td><td><div className="load"><div className="progress"><i className={person.status === 'Overloaded' ? 'over' : ''} style={{ width: `${Math.min(100, person.utilization ?? 0)}%` }} /></div><span>{formatPercent(person.utilization)}</span></div></td><td>{person.streams[0]?.title ?? '—'}{person.streams.length > 1 && <small>+{person.streams.length - 1} more</small>}</td></tr>)}</tbody></table>
      </TablePanel>
      <TablePanel title="Streams of work" detail="Epics with booked hours this month. Absence is excluded." count={`${model.streams.length} streams`} empty={model.streams.length ? undefined : 'No booked hours this month.'}>
        <table><thead><tr><th>Stream (Epic)</th><th>Booked</th><th>Share</th><th>Planned</th><th>People</th></tr></thead><tbody>{model.streams.map((stream) => <tr key={stream.key}><td>{stream.epic ? <a href={stream.epic.url} target="_blank" rel="noreferrer">#{stream.epic.id} {stream.title}</a> : stream.title}<small>{stream.features} feature{stream.features === 1 ? '' : 's'}</small></td><td>{formatHours(stream.work)}</td><td><div className="load"><div className="progress"><i style={{ width: `${stream.share ?? 0}%` }} /></div><span>{formatPercent(stream.share, 0)}</span></div></td><td>{formatHours(stream.planned)}</td><td>{stream.people}</td></tr>)}</tbody></table>
      </TablePanel>
    </div>
    <TablePanel className="matrix" title="Hours by person and stream" detail={otherStreams.length ? `Top ${maxMatrixStreams} streams by hours; ${otherStreams.length} smaller stream(s) grouped under Other.` : 'Booked hours (Completed Work) per person and Epic.'} empty={model.people.length && model.streams.length ? undefined : 'Nothing to break down yet.'}>
      {model.people.length > 0 && model.streams.length > 0 && <div className="azure-table"><table><thead><tr><th>Person</th>{matrixStreams.map((stream) => <th key={stream.key} title={stream.title}>{stream.title}</th>)}{otherStreams.length > 0 && <th>Other</th>}<th>Absence</th><th>Total</th></tr></thead><tbody>{model.people.map((person) => <tr key={person.name}><td><strong>{person.name}</strong></td>{matrixStreams.map((stream) => { const cell = person.streams.find((item) => item.key === stream.key); return <td key={stream.key} className={cell ? '' : 'muted'}>{cell ? formatHours(cell.work) : '·'}</td> })}{otherStreams.length > 0 && <td>{formatHours(personOther(person.streams)) || '·'}</td>}<td>{person.absence ? formatHours(person.absence) : '·'}</td><td><strong>{formatHours(person.work)}</strong></td></tr>)}<tr className="matrix-total"><td>Total</td>{matrixStreams.map((stream) => <td key={stream.key}>{formatHours(stream.work)}</td>)}{otherStreams.length > 0 && <td>{formatHours(otherStreams.reduce((sum, stream) => sum + stream.work, 0))}</td>}<td>{formatHours(model.totals.absence)}</td><td><strong>{formatHours(model.totals.work)}</strong></td></tr></tbody></table></div>}
    </TablePanel>
    <div className="dashboard-grid">
      <Panel title="How utilization is calculated">
        <p>Funded hours per person: {model.workingDays} working days × {settings.hoursPerDay}h = {formatHours(model.fundedPerPerson)}h.</p>
        <p>Available = funded − absence hours (Completed Work on Tasks under Epic #{settings.absenceEpicId}; PTO, Sick Leave and Unplanned Leave are read from the Feature and Task titles).</p>
        <p>Utilization = booked hours (Completed Work on all other {monthName(month)} Time Writing Tasks) ÷ available × 100. Overloaded at ≥ {settings.overloadedAt}%; has capacity below {settings.availableBelow}%.</p>
        <p className="muted">Tasks are matched to the month by the “{monthName(month)} | …” title convention. Thresholds and the absence Epic are set under Administration → Capacity and absence.</p>
        <div className="button-row"><button className="text-button" onClick={() => navigate('monthly')}>Open monthly detail →</button><button className="text-button" onClick={() => navigate('admin')}>Capacity settings →</button></div>
      </Panel>
      <Panel title="Absence this month" detail={`Completed Work under Epic #${settings.absenceEpicId}`}>
        {model.totals.absence > 0 ? absenceKinds.filter((kind) => model.totals.absenceByKind[kind] > 0).map((kind) => <div className="utilization-row" key={kind}><div>{kind}</div><div className="progress"><i style={{ width: `${model.totals.absence ? model.totals.absenceByKind[kind] / model.totals.absence * 100 : 0}%` }} /></div><strong>{formatHours(model.totals.absenceByKind[kind])}h</strong></div>) : <EmptyState title="No absence booked." detail="Hours under the absence Epic appear here split by PTO, Sick Leave and Unplanned Leave." />}
        {model.people.filter((person) => person.absence > 0).length > 0 && <p className="muted">{model.people.filter((person) => person.absence > 0).map((person) => `${person.name} ${formatHours(person.absence)}h`).join(' · ')}</p>}
      </Panel>
    </div>
  </Page>
}
