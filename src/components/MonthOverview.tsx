import { EmptyState, Info, Metric, Metrics, Panel, Pill, TablePanel, type Tone } from './ui'
import { DataTable } from './DataTable'
import { DonutChart, EpicBulletChart } from './WorkloadCharts'
import { epicColors } from '../chartUtils'
import { absenceKinds, capacityModel, monthlyHours, type CapacitySettings, type LoadStatus } from '../capacity'
import { formatHours, formatPercent, monthName } from '../format'
import type { AzureWorkItem } from '../domain'
import type { Page as PageId } from '../pages/registry'

// Overview "This month", for any month: Overview shows the selected month, Pulse Check → Last month the one before it.
const statusTone: Record<LoadStatus, Tone> = { 'Overloaded': 'danger', 'Balanced': 'open', 'Has capacity': 'info', 'No bookings': 'neutral' }
const maxMatrixStreams = 8
export type CapacityModel = ReturnType<typeof capacityModel>

export function CapacityMetrics({ model, settings, label }: { model: CapacityModel; settings: CapacitySettings; label: string }) {
  return <>
  <Metrics>
    <Metric label={label} value={formatPercent(model.totals.utilization)} hint={`${formatHours(model.totals.work)}h booked of ${formatHours(model.totals.available)}h available`} tone={model.totals.utilization != null && model.totals.utilization >= settings.overloadedAt ? 'negative' : undefined} />
    <Metric label="Overloaded" value={model.counts.overloaded} hint={`≥ ${settings.overloadedAt}% of available hours`} tone={model.counts.overloaded ? 'negative' : undefined} />
    <Metric label="Has capacity" value={model.counts.hasCapacity} hint={`< ${settings.availableBelow}% of available hours`} tone={model.counts.hasCapacity ? 'positive' : undefined} />
    <Metric label="NPRA" value={formatHours(model.totals.npra)} hint={settings.npraHoursPerMonth > 0 ? `max ${formatHours(settings.npraHoursPerMonth)}h per person · ${model.counts.npraOver ? `${model.counts.npraOver} over it` : 'nobody over it'}` : 'Tasks tagged NPRA · no maximum set'} tone={model.counts.npraOver ? 'negative' : undefined} />
    <Metric label="Absence" value={formatHours(model.totals.absence)} hint={[...absenceKinds.filter((kind) => model.totals.absenceByKind[kind]).map((kind) => `${kind} ${formatHours(model.totals.absenceByKind[kind])}h`), ...(model.totals.reserved ? [`common activities ${formatHours(model.totals.reserved)}h (reserved)`] : [])].join(' · ') || `Under Epic #${settings.absenceEpicId}`} />
  </Metrics>
  </>
}

// utilizationOnly: just Who has capacity and how utilization is calculated (Pulse Check → Last month).
export function MonthSections({ items, month, settings, navigate, utilizationOnly = false }: { items: AzureWorkItem[]; month: string; settings: CapacitySettings; navigate: (page: PageId) => void; utilizationOnly?: boolean }) {
  const model = capacityModel(items, month, settings)
  const profileLine = (name: string) => [settings.profiles?.[name]?.role, settings.profiles?.[name]?.region].filter(Boolean).join(' · ')
  const fundedOver = Math.max(0, model.totals.work + model.totals.absence + model.totals.reserved + model.totals.npraDeducted - model.totals.funded)
  const matrixMax = Math.max(1, ...model.people.flatMap((person) => person.streams.map((stream) => stream.work)))
  // Epic colours come from a fixed 12-month window, as on Overview, so an Epic keeps its colour.
  const colors = epicColors(monthlyHours(items, month, 12, settings))
  const matrixStreams = model.streams.slice(0, maxMatrixStreams)
  const otherStreams = model.streams.slice(maxMatrixStreams)
  const personOther = (streams: CapacityModel['people'][number]['streams']) => streams.filter((stream) => otherStreams.some((other) => other.key === stream.key)).reduce((sum, stream) => sum + stream.work, 0)
  return <>
  <div className="overview-stack">
    {(model.prorated.length > 0 || model.outsideEmployment.length > 0) && <p className="muted employment-note" role="note">
      {model.prorated.length > 0 && <>Part of the month only (Settings → Resources): {model.prorated.map((person) => `${person.name} ${person.days} of ${model.workingDays} days, ${formatHours(person.funded)}h funded`).join(' · ')}. </>}
      {model.outsideEmployment.length > 0 && <>Not employed in {monthName(month)}, so not counted: {model.outsideEmployment.map((person) => `${person.name}${person.leftOn ? ` (left ${person.leftOn})` : person.joinedOn ? ` (joins ${person.joinedOn})` : ''}${person.hours ? ` — ${formatHours(person.hours)}h booked on ${person.tasks} Task${person.tasks === 1 ? '' : 's'}, check them` : ''}`).join(' · ')}.</>}
    </p>}
    <TablePanel title="Who has capacity" info={`${monthName(month)} · ${model.workingDays} working days × ${settings.hoursPerDay}h = ${formatHours(model.fundedPerPerson)}h funded per person, less absence, common activities (PI Planning, audits) and booked NPRA hours (Settings → Capacity).`} count={`${model.people.length} people`} empty={model.people.length ? undefined : 'No Time Writing Tasks for this month.'}>
      <DataTable id="capacity:people" rows={model.people} rowKey={(person) => person.name} exportName={`Who has capacity ${month}`} columns={[
        { id: 'person', label: 'Person', value: (person) => person.name, render: (person) => <><strong>{person.name}</strong>{profileLine(person.name) && <small>{profileLine(person.name)}</small>}{person.absence > 0 && <small>{formatHours(person.absence)}h absence</small>}{person.reserved > 0 && <small>{formatHours(person.reserved)}h common activities</small>}{(person.npra > 0 || person.npraAllowance > 0) && <small className={person.npraOver > 0 ? 'negative' : ''}>NPRA {formatHours(person.npra)}h{person.npraAllowance > 0 ? ` / ${formatHours(person.npraAllowance)}h` : ''}{person.npraOver > 0 ? ` · ${formatHours(person.npraOver)}h over` : ''}</small>}</> },
        { id: 'status', label: 'Status', value: (person) => person.status, render: (person) => <Pill tone={statusTone[person.status]}>{person.status}</Pill> },
        { id: 'available', label: 'Available', align: 'right', firstSortDesc: true, value: (person) => person.available, render: (person) => formatHours(person.available) },
        { id: 'planned', label: 'Planned', align: 'right', firstSortDesc: true, value: (person) => person.planned, render: (person) => formatHours(person.planned) },
        { id: 'booked', label: 'Booked', align: 'right', firstSortDesc: true, value: (person) => person.work, render: (person) => formatHours(person.work) },
        { id: 'utilization', label: 'Utilization', firstSortDesc: true, value: (person) => person.utilization ?? '', render: (person) => <div className="load"><div className="progress"><i className={person.status === 'Overloaded' ? 'over' : ''} style={{ width: `${Math.min(100, person.utilization ?? 0)}%` }} /></div><span>{formatPercent(person.utilization)}</span></div> },
        { id: 'stream', label: 'Main stream', value: (person) => person.streams[0]?.title ?? '', render: (person) => <>{person.streams[0]?.title ?? '—'}{person.streams.length > 1 && <small>+{person.streams.length - 1} more</small>}</> },
        { id: 'absence', label: 'Absence (h)', align: 'right', defaultHidden: true, value: (person) => person.absence },
        { id: 'npra', label: 'NPRA (h)', align: 'right', defaultHidden: true, value: (person) => person.npra },
      ]} />
    </TablePanel>
    <TablePanel title={`NPRA · ${monthName(month)}`} info={`Non-project related activities — internal meetings (stand-up, special projects, town hall) and trainings (white belt, AI, Cornerstone) — are Tasks (or Stories / Features) tagged “NPRA”. The hours booked on them come off the person's available hours (only what is booked). ${settings.npraHoursPerMonth > 0 ? `The maximum is ${formatHours(settings.npraHoursPerMonth)}h per person per month; hours over it are flagged.` : 'No maximum is set; the hours are tracked only.'} Unplanned sick leave is not NPRA: book it under the absence Epic by the end of the month at the latest — it is deducted from the available hours.`} count={`${formatHours(model.totals.npra)}h booked`} empty={model.people.some((person) => person.npra > 0 || person.npraPlanned > 0) ? undefined : 'No NPRA hours booked this month. Tag the Tasks (or their Story / Feature) with “NPRA”.'}>
      <DataTable id="capacity:npra" rows={model.people.filter((person) => person.npra > 0 || person.npraPlanned > 0)} rowKey={(person) => person.name} exportName={`NPRA ${month}`} defaultSort={{ id: 'booked', desc: true }} columns={[
        { id: 'person', label: 'Person', value: (person) => person.name, render: (person) => <><strong>{person.name}</strong><small>{person.npraTasks} task{person.npraTasks === 1 ? '' : 's'}</small></> },
        { id: 'booked', label: 'Booked', align: 'right', firstSortDesc: true, value: (person) => person.npra, render: (person) => formatHours(person.npra) },
        { id: 'planned', label: 'Planned', align: 'right', firstSortDesc: true, value: (person) => person.npraPlanned, render: (person) => formatHours(person.npraPlanned) },
        { id: 'maximum', label: 'Maximum', align: 'right', value: (person) => person.npraAllowance > 0 ? person.npraAllowance : '', render: (person) => person.npraAllowance > 0 ? formatHours(person.npraAllowance) : '—' },
        { id: 'left', label: 'Left', align: 'right', value: (person) => person.npraAllowance > 0 ? Math.max(0, person.npraAllowance - person.npra) : '', render: (person) => person.npraAllowance > 0 ? formatHours(Math.max(0, person.npraAllowance - person.npra)) : '—' },
        { id: 'status', label: 'Status', value: (person) => person.npraOver > 0 ? `${formatHours(person.npraOver)}h over the maximum` : person.npraAllowance > 0 ? 'Within' : 'Tracked', render: (person) => person.npraOver > 0 ? <Pill tone="danger">{formatHours(person.npraOver)}h over the maximum</Pill> : person.npraAllowance > 0 ? <Pill tone="open">Within {formatHours(person.npraAllowance)}h</Pill> : <Pill tone="neutral">Tracked</Pill> },
      ]} />
    </TablePanel>
    {!utilizationOnly && <>
    <TablePanel title="Streams of work" info="Epics with booked hours this month. Absence is excluded." count={`${model.streams.length} streams`} empty={model.streams.length ? undefined : 'No booked hours this month.'}>
      <DataTable id="capacity:streams" rows={model.streams} rowKey={(stream) => stream.key} exportName={`Streams of work ${month}`} columns={[
        { id: 'stream', label: 'Stream (Epic)', value: (stream) => stream.title, render: (stream) => <>{stream.epic ? <a href={stream.epic.url} target="_blank" rel="noreferrer">#{stream.epic.id} {stream.title}</a> : stream.title}<small>{stream.features} feature{stream.features === 1 ? '' : 's'}</small></> },
        { id: 'booked', label: 'Booked', align: 'right', firstSortDesc: true, value: (stream) => stream.work, render: (stream) => formatHours(stream.work) },
        { id: 'share', label: 'Share', firstSortDesc: true, value: (stream) => stream.share ?? '', render: (stream) => <div className="load"><div className="progress"><i style={{ width: `${stream.share ?? 0}%` }} /></div><span>{formatPercent(stream.share, 0)}</span></div> },
        { id: 'planned', label: 'Planned', align: 'right', firstSortDesc: true, value: (stream) => stream.planned, render: (stream) => formatHours(stream.planned) },
        { id: 'people', label: 'People', align: 'right', firstSortDesc: true, value: (stream) => stream.people },
      ]} />
    </TablePanel>
    </>}
  </div>
  {!utilizationOnly && <>
  <Panel className="viz-panel" title={`Hours by Epic · ${monthName(month)}`} info="Bar = booked hours, tick = planned hours; share of the month's booked hours on the right. Absence is excluded.">
        {model.streams.length ? <EpicBulletChart streams={model.streams} colors={colors} /> : <EmptyState title="No booked hours this month." />}
  </Panel>
  <div className="dashboard-grid viz-grid-2">
    <Panel className="viz-panel" title={`Funded hours · ${monthName(month)}`} info={fundedOver > 0 ? `Booked plus absence exceeds funded hours by ${formatHours(fundedOver)}h, so the ring shows booked and absence only.` : 'Where the team’s funded hours went: booked work, absence, common activities, NPRA and unbooked capacity.'}>
      {model.totals.funded > 0 ? <DonutChart label="Funded hours" centerValue={`${formatHours(model.totals.funded)}h`} centerLabel="funded" segments={[{ key: 'booked', label: 'Booked work', value: model.totals.work, color: 'var(--viz-series-1)' }, { key: 'absence', label: 'Absence', value: model.totals.absence, color: 'var(--viz-series-4)' }, ...(model.totals.npraDeducted > 0 ? [{ key: 'npra', label: 'NPRA', value: model.totals.npraDeducted, color: 'var(--viz-series-5)' }] : []), ...(model.totals.reserved > 0 ? [{ key: 'reserved', label: 'Common activities', value: model.totals.reserved, color: 'var(--viz-series-3)' }] : []), { key: 'unbooked', label: 'Unbooked capacity', value: Math.max(0, model.totals.funded - model.totals.work - model.totals.absence - model.totals.reserved), color: 'var(--viz-other)' }]} /> : <EmptyState title="No funded hours this month." />}
    </Panel>
    <Panel className="viz-panel" title={`Absence · ${monthName(month)}`} info={`Completed Work under Epic #${settings.absenceEpicId}; regional holidays apply to everyone mapped to that region`}>
      {model.totals.absence > 0 ? <DonutChart label="Absence" centerValue={`${formatHours(model.totals.absence)}h`} centerLabel="absence" segments={absenceKinds.map((kind, index) => ({ key: kind, label: kind, value: model.totals.absenceByKind[kind], color: index < 4 ? `var(--viz-series-${index + 1})` : 'var(--viz-other)' }))} /> : <EmptyState title="No absence booked." detail="Hours under the absence Epic appear here split by PTO, Sick Leave, Unplanned Leave and regional public holidays." />}
      {model.people.filter((person) => person.absence > 0).length > 0 && <p className="muted">{model.people.filter((person) => person.absence > 0).map((person) => `${person.name} ${formatHours(person.absence)}h`).join(' · ')}</p>}
    </Panel>
  </div>
  <TablePanel className="matrix" title="Hours by person and stream" info={otherStreams.length ? `Top ${maxMatrixStreams} streams by hours; ${otherStreams.length} smaller stream(s) grouped under Other. Darker cells = more hours.` : 'Booked hours (Completed Work) per person and Epic; darker cells = more hours.'} empty={model.people.length && model.streams.length ? undefined : 'Nothing to break down yet.'}>
    {model.people.length > 0 && model.streams.length > 0 && <DataTable id="capacity:matrix" rows={model.people} rowKey={(person) => person.name} exportName={`Hours by person and stream ${month}`}
      totals={{ values: { ...Object.fromEntries(matrixStreams.map((stream) => [stream.key, formatHours(stream.work)])), ...(otherStreams.length ? { other: formatHours(otherStreams.reduce((sum, stream) => sum + stream.work, 0)) } : {}), absence: formatHours(model.totals.absence), total: <strong>{formatHours(model.totals.work)}</strong> } }}
      columns={[
        { id: 'person', label: 'Person', value: (person) => person.name, render: (person) => <strong>{person.name}</strong> },
        ...matrixStreams.map((stream) => ({ id: stream.key, label: stream.title, align: 'right' as const, firstSortDesc: true, value: (person: typeof model.people[number]) => person.streams.find((item) => item.key === stream.key)?.work ?? '', render: (person: typeof model.people[number]) => { const cell = person.streams.find((item) => item.key === stream.key); return cell ? <span className="viz-shade" style={{ display: 'block', background: `color-mix(in srgb, var(--viz-diverge-lo) ${Math.round(cell.work / matrixMax * 40)}%, transparent)` }}>{formatHours(cell.work)}</span> : <span className="muted">·</span> } })),
        ...(otherStreams.length ? [{ id: 'other', label: 'Other', align: 'right' as const, value: (person: typeof model.people[number]) => personOther(person.streams) || '', render: (person: typeof model.people[number]) => formatHours(personOther(person.streams)) || '·' }] : []),
        { id: 'absence', label: 'Absence', align: 'right', value: (person) => person.absence || '', render: (person) => person.absence ? formatHours(person.absence) : '·' },
        { id: 'total', label: 'Total', align: 'right', firstSortDesc: true, value: (person) => person.work, render: (person) => <strong>{formatHours(person.work)}</strong> },
      ]} />}
  </TablePanel>
  </>}
  <div className="how-calculated"><Info label="How utilization is calculated">
    <p>Funded hours per person: {model.workingDays} working days × {settings.hoursPerDay}h = {formatHours(model.fundedPerPerson)}h.</p>
    <p>Available = funded − absence hours (Completed Work on the leave Tasks under the Team Holidays and Training Epic #{settings.absenceEpicId}; PTO, Sick Leave and Unplanned Leave are read from the Feature and Task titles; its Training Tasks count as NPRA; unplanned sick leave is booked by the end of the month at the latest) − holidays and common activities mapped in Settings → Capacity (each of their month Tasks applies to everyone in its scope) − NPRA hours booked on Tasks tagged NPRA (only what is booked{settings.npraHoursPerMonth > 0 ? `; over ${formatHours(settings.npraHoursPerMonth)}h per person is flagged` : ''}).</p>
    <p>Utilization = booked hours (Completed Work on all other {monthName(month)} Time Writing Tasks; NPRA Tasks are not project work) ÷ available × 100. Overloaded at ≥ {settings.overloadedAt}%; has capacity below {settings.availableBelow}%.</p>
    <p className="muted">Tasks are matched to the month when their title starts or ends with the month and year (e.g. “{monthName(month)} | …” or “… | {monthName(month)}”, any delimiter). Thresholds and the absence Epic are set under Settings → Capacity and absence.</p>
    <div className="button-row"><button className="text-button" onClick={() => navigate('monthly')}>Open monthly detail →</button><button className="text-button" onClick={() => navigate('admin')}>Capacity settings →</button></div>
  </Info></div>
  </>
}
