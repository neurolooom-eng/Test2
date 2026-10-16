import { useState } from 'react'
import { Metric, Metrics, Page, Pill, TablePanel } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import { azureInsights } from '../azureInsights'
import { formatHours, todayIso } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'

export function BaselinesPage({ azure, month, onOpenConnection }: { azure: AzureWorkspace; month: string; onOpenConnection: () => void }) {
  const [today] = useState(todayIso)
  const data = azureInsights(azure.items, month, today)
  const rows = data.epicBreakdown.flatMap(group => data.monthlyTasks.filter(task => group.stories.some(story => story.id === task.parentId)).map(task => {
    const variance = task.originalEstimate == null || task.completedWork == null ? null : task.completedWork - task.originalEstimate
    const flagged = task.originalEstimate != null && task.originalEstimate > 0 && task.completedWork != null && task.completedWork > task.originalEstimate * 1.25
    return { group, task, variance, flagged }
  }))
  return <Page>
    <AzureSourceBar azure={azure} onOpenConnection={onOpenConnection} />
    <Metrics>
      <Metric label="Month tasks" value={data.monthlyTasks.length} hint={`${data.paired.length} with both fields populated`} />
      <Metric label="Original Estimate" value={formatHours(data.plan.value)} hint={`${data.plan.count}/${data.plan.total} tasks populated`} />
      <Metric label="Completed Work" value={formatHours(data.actual.value)} hint={`${data.actual.count}/${data.actual.total} tasks populated`} />
      <Metric label="Variance" value={formatHours(data.variance)} hint={`${data.flags.length} task(s) above +25%`} tone={data.flags.length ? 'negative' : undefined} />
    </Metrics>
    <TablePanel title="Time Writing Tasks" detail="Variance is Completed Work minus Original Estimate on the same Task." count={`${rows.length} tasks`} empty={rows.length ? undefined : 'No selected-month Time Writing Tasks.'}>
      <table><thead><tr><th>Epic</th><th>Time Writing Task</th><th>Original Estimate</th><th>Completed Work</th><th>Variance</th><th>Signal</th></tr></thead><tbody>{rows.map(({ group, task, variance, flagged }) => <tr key={task.key}><td>{group.epic?.title ?? 'No Epic path'}</td><td><a href={task.url} target="_blank" rel="noreferrer">#{task.id} {task.title}</a></td><td>{formatHours(task.originalEstimate)}</td><td>{formatHours(task.completedWork)}</td><td className={variance != null && variance > 0 ? 'negative' : ''}>{formatHours(variance)}</td><td><Pill tone={flagged ? 'warning' : 'neutral'}>{flagged ? '>25%' : '—'}</Pill></td></tr>)}</tbody></table>
    </TablePanel>
  </Page>
}
