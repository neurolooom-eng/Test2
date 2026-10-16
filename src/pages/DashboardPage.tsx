import { useState } from 'react'
import { Metric, Metrics, Page, Panel, TablePanel } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights } from '../azureInsights'
import { formatHours, formatPercent, monthName, todayIso } from '../format'
import type { Page as PageId } from './registry'

export function DashboardPage({ month, azure, navigate }: { month: string; azure: AzureWorkspace; navigate: (page: PageId) => void }) {
  const [today] = useState(todayIso)
  const data = azureInsights(azure.items, month, today)
  return <Page>
    <AzureSourceBar azure={azure} onOpenConnection={() => navigate('azure')}><button className="ghost" onClick={() => navigate('board')}>Open Backlogs</button></AzureSourceBar>
    <Metrics>
      <Metric label="Original Estimate" value={formatHours(data.plan.value)} hint={`${data.plan.count}/${data.plan.total} tasks populated`} />
      <Metric label="Completed Work" value={formatHours(data.actual.value)} hint={`${data.actual.count}/${data.actual.total} tasks populated`} />
      <Metric label="Absence hours" value={formatHours(data.absence.value)} hint="Completed Work under Epic #37778" />
      <Metric label="Utilization" value={formatPercent(data.utilization)} hint={`${data.workingDays} working days · ${data.capacity}h funded`} />
    </Metrics>
    <div className="dashboard-grid">
      <TablePanel title="Original Estimate vs Completed Work by Epic" detail={`Only stories with a “${monthName(month)} | …” child task.`} count={`${data.storiesForMonth.length} stories`} empty={data.epicBreakdown.length ? undefined : 'No Time Writing entries for this month.'}>
        <table><thead><tr><th>Epic</th><th>Stories</th><th>Month tasks</th><th>Original Estimate</th><th>Completed Work</th><th>NPRA</th></tr></thead><tbody>{data.epicBreakdown.map(group => <tr key={group.epic?.key ?? 'unmapped'}><td>{group.epic ? <a href={group.epic.url} target="_blank" rel="noreferrer">#{group.epic.id} {group.epic.title}</a> : 'No Epic path'}</td><td>{group.stories.length}</td><td>{group.tasks}</td><td>{formatHours(group.plan.value)}</td><td>{formatHours(group.actual.value)}</td><td>{formatHours(group.npra.value)}</td></tr>)}</tbody></table>
      </TablePanel>
      <Panel title="Utilization basis">
        <p>Funded hours: {data.workingDays} weekdays × 8h = {data.dayCapacity}h.</p>
        <p>Denominator: all Time Writing Actuals ({formatHours(data.actual.value)}h) − Absence Actuals under Epic #37778 ({formatHours(data.absence.value)}h) = {formatHours(data.available)}h.</p>
        <p>Formula: funded hours ÷ (all Actuals − Absence hours) × 100.</p>
        <p className="muted">NPRA is tracked separately and does not change this utilization calculation.</p>
        <button className="text-button" onClick={() => navigate('monthly')}>Open monthly detail →</button>
      </Panel>
    </div>
  </Page>
}
