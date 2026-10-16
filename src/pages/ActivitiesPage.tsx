import { useMemo, useState } from 'react'
import { Page, Pill, TablePanel } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import { formatDate } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'

export function ActivitiesPage({ azure, onOpenConnection }: { azure: AzureWorkspace; onOpenConnection: () => void }) {
  const [search, setSearch] = useState('')
  const rows = useMemo(() => azure.items.filter(item => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(search.toLowerCase())), [azure.items, search])
  return <Page>
    <AzureSourceBar azure={azure} onOpenConnection={onOpenConnection} />
    <TablePanel title="Work items" count={`${rows.length} items`} action={<input className="search" aria-label="Search work items" placeholder="Search ID, title, type or state" value={search} onChange={event => setSearch(event.target.value)} />} empty={rows.length ? undefined : azure.items.length ? 'No work items match this search.' : 'Refresh Azure DevOps to load work items.'}>
      <table><thead><tr><th>Work item</th><th>Type</th><th>State</th><th>Assigned to</th><th>Iteration</th><th>Target date</th><th>Closed date</th></tr></thead><tbody>{rows.slice(0, 200).map(item => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a></td><td>{item.workItemType}</td><td><Pill tone="info">{item.state}</Pill></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath || '—'}</td><td>{formatDate(item.targetDate)}</td><td>{formatDate(item.closedDate)}</td></tr>)}</tbody></table>
      {rows.length > 200 && <p className="muted">Showing the first 200 of {rows.length} matching work items.</p>}
    </TablePanel>
  </Page>
}
