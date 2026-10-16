import { useState } from 'react'
import { EmptyState, Page, Panel, Pill } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import { AzureWorkItemTree } from '../components/AzureWorkItemTree'
import { formatDate, formatDateTime } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'

export function BoardPage({ azure, onOpenConnection }: { azure: AzureWorkspace; onOpenConnection: () => void }) {
  const { items, config, preview, pat, featureCreated, rememberPat } = azure
  const [filter, setFilter] = useState('')
  const activeItems = items.filter((item) => item.state.trim().toLowerCase() !== 'removed')
  const shown = activeItems.filter((item) => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(filter.toLowerCase()))
  const counts = new Map<string, number>()
  for (const item of activeItems) counts.set(item.workItemType || 'Unknown', (counts.get(item.workItemType || 'Unknown') ?? 0) + 1)

  return <Page className="backlog-page">
    <AzureSourceBar azure={azure} onOpenConnection={onOpenConnection} />
    {config ? <Panel className="connection-panel backlog-panel"><AzureWorkItemTree items={items} config={config} onCreated={featureCreated} savedPat={pat} creatorEmail={azure.creatorEmail} onSavePat={rememberPat} /></Panel> : <Panel><EmptyState title="Configure a valid Azure DevOps project to use Backlogs." /><button className="primary" onClick={onOpenConnection}>Open connection settings</button></Panel>}
    <details className="source-details"><summary>Source details and dates ({items.length} items)</summary>
      <Panel className="connection-panel" title={preview ? 'Work-item preview' : 'Saved work items'} detail={`${items.length} items · ${preview ? `Scope: ${preview.areaPaths.join(', ')}` : 'Refresh source data from connection settings.'}`} action={<input aria-label="Search work-item details" className="search" placeholder="Search ID, title, type or state" value={filter} onChange={(event) => setFilter(event.target.value)} />}>
        <div className="button-row">{[...counts].map(([type, count]) => <Pill key={type} tone="info">{type}: {count}</Pill>)}</div>
        <p className="muted">Only verified team-backlog records are shown. Missing target/closure dates stay blank. Saving a fresh scoped result replaces the Azure cache; no Azure source records or demand-planning data are deleted.</p>
        {shown.length > 0 ? <div className="azure-table"><table><thead><tr><th>ID / Title</th><th>Type / State</th><th>Assigned to</th><th>Iteration / Parent</th><th>Target / Closed</th><th>Last fetched</th></tr></thead><tbody>{shown.slice(0, 100).map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a><strong>{item.title}</strong></td><td>{item.workItemType}<small>{item.state}</small></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath}<small>{item.parentId ? `Parent #${item.parentId}` : 'No parent supplied'}</small></td><td>{formatDate(item.targetDate, 'No target date')}<small>{formatDate(item.closedDate, 'No closed date')}</small></td><td>{formatDateTime(item.syncedAt)}</td></tr>)}</tbody></table><p className="muted">Showing {Math.min(shown.length, 100)} of {shown.length} matching work items.</p></div> : <EmptyState title={items.length ? 'No matching work items.' : 'No work items loaded yet.'} />}
      </Panel>
    </details>
  </Page>
}
