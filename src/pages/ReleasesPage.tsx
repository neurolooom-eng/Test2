import { useState } from 'react'
import { Metric, Metrics, Page, Pill, TablePanel } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import { azureInsights, indiaMonth } from '../azureInsights'
import { formatDate, monthName, todayIso } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'

export function ReleasesPage({ azure, month, onOpenConnection }: { azure: AzureWorkspace; month: string; onOpenConnection: () => void }) {
  const [today] = useState(todayIso)
  const data = azureInsights(azure.items, month, today)
  const features = data.features.filter(item => indiaMonth(item.closedDate) === month || item.targetDate?.startsWith(month))
  const overdue = data.overdue.filter(item => item.workItemType === 'Feature').length
  return <Page>
    <AzureSourceBar azure={azure} onOpenConnection={onOpenConnection} />
    <Metrics>
      <Metric label="Features" value={features.length} hint={`Targeted or closed in ${monthName(month)}`} />
      <Metric label="Closed" value={data.closures.length} hint="Closed/Done/Completed this month" />
      <Metric label="Overdue" value={overdue} hint="Open Features with an elapsed target date" tone={overdue ? 'negative' : undefined} />
      <Metric label="Same month last year" value={data.priorClosures} hint="Features closed" />
    </Metrics>
    <TablePanel title="Features" count={`${features.length} features`} empty={features.length ? undefined : `No Feature dates match ${monthName(month)}.`}>
      <table><thead><tr><th>Feature</th><th>State</th><th>Assigned to</th><th>Target date</th><th>Closed date</th><th>Iteration</th></tr></thead><tbody>{features.map(item => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a></td><td><Pill tone="info">{item.state}</Pill></td><td>{item.assignedTo || 'Unassigned'}</td><td>{formatDate(item.targetDate)}</td><td>{formatDate(item.closedDate)}</td><td>{item.iterationPath || '—'}</td></tr>)}</tbody></table>
    </TablePanel>
  </Page>
}
