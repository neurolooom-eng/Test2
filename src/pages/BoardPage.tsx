import { useState } from 'react'
import { EmptyState, Page, Panel, Pill } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import { AzureWorkItemTree } from '../components/AzureWorkItemTree'
import { formatDate, formatDateTime } from '../format'
import { connectionConfig, type AzureWorkspace } from '../useAzureWorkspace'
import { loadAzureConnectionProfile } from '../azureCredentials'
import { backlogViews, loadBacklogTab, saveBacklogTab } from '../backlogViews'
import type { AzureConfig } from '../azureDevOps'
import type { PageProps } from './types'

export function BoardPage({ azure, store, onOpenConnection }: { azure: AzureWorkspace; store: PageProps['store']; onOpenConnection: () => void }) {
  const { items, config, preview, pat, featureCreated, rememberPat } = azure
  const [filter, setFilter] = useState('')
  const views = backlogViews(azure.connectionProfiles, azure.activeConnectionProfileId)
  const [tab, setTab] = useState(loadBacklogTab)
  const current = views.find((view) => view.id === tab) ?? views[0]
  const choose = (id: string) => { setTab(id); saveBacklogTab(id) }
  const tabs = views.length > 1 ? <div className="backlog-tabs" role="tablist" aria-label="Backlog views">{views.map((view) => <button key={view.id} type="button" role="tab" aria-selected={view.id === current.id} className={`backlog-tab ${view.id === current.id ? 'backlog-tab-active' : ''}`} onClick={() => choose(view.id)}>{view.name}{view.readOnly && <small> · read only</small>}</button>)}</div> : undefined
  if (current.readOnly) return <ReadOnlyView key={current.id} id={current.id} name={current.name} azure={azure} store={store} tabs={tabs} onOpenConnection={onOpenConnection} />
  const activeItems = items.filter((item) => item.state.trim().toLowerCase() !== 'removed')
  const shown = activeItems.filter((item) => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(filter.toLowerCase()))
  const counts = new Map<string, number>()
  for (const item of activeItems) counts.set(item.workItemType || 'Unknown', (counts.get(item.workItemType || 'Unknown') ?? 0) + 1)

  return <Page className="backlog-page">
    <AzureSourceBar azure={azure} onOpenConnection={onOpenConnection} />
    {config ? <Panel className="connection-panel backlog-panel"><AzureWorkItemTree items={items} config={config} title={tabs ? current.name : undefined} tabs={tabs} onCreated={featureCreated} savedPat={pat} creatorEmail={azure.creatorEmail} onSavePat={rememberPat} /></Panel> : <Panel><EmptyState title="Configure a valid Azure DevOps project to use Backlogs." /><button className="primary" onClick={onOpenConnection}>Open connection settings</button></Panel>}
    <details className="source-details"><summary>Source details and dates ({items.length} items)</summary>
      <Panel className="connection-panel" title={preview ? 'Work-item preview' : 'Saved work items'} detail={`${items.length} items · ${preview ? `Scope: ${preview.areaPaths.join(', ')}` : 'Refresh source data from connection settings.'}`} action={<input aria-label="Search work-item details" className="search" placeholder="Search ID, title, type or state" value={filter} onChange={(event) => setFilter(event.target.value)} />}>
        <div className="button-row">{[...counts].map(([type, count]) => <Pill key={type} tone="info">{type}: {count}</Pill>)}</div>
        <p className="muted">Only verified team-backlog records are shown. Missing target/closure dates stay blank. Saving a fresh scoped result replaces the Azure cache; no Azure source records or demand-planning data are deleted.</p>
        {shown.length > 0 ? <div className="azure-table"><table><thead><tr><th>ID / Title</th><th>Type / State</th><th>Assigned to</th><th>Iteration / Parent</th><th>Target / Closed</th><th>Last fetched</th></tr></thead><tbody>{shown.slice(0, 100).map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a><strong>{item.title}</strong></td><td>{item.workItemType}<small>{item.state}</small></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath}<small>{item.parentId ? `Parent #${item.parentId}` : 'No parent supplied'}</small></td><td>{formatDate(item.targetDate, 'No target date')}<small>{formatDate(item.closedDate, 'No closed date')}</small></td><td>{formatDateTime(item.syncedAt)}</td></tr>)}</tbody></table><p className="muted">Showing {Math.min(shown.length, 100)} of {shown.length} matching work items.</p></div> : <EmptyState title={items.length ? 'No matching work items.' : 'No work items loaded yet.'} />}
      </Panel>
    </details>
  </Page>
}

// A Backlog view connection: its last fetched snapshot as the same expandable tree, read only.
function ReadOnlyView({ id, name, azure, store, tabs, onOpenConnection }: { id: string; name: string; azure: AzureWorkspace; store: PageProps['store']; tabs: React.ReactNode; onOpenConnection: () => void }) {
  const source = (store.state.azureSources ?? []).find((entry) => entry.connectionId === id)
  const status = azure.connectionStatus[id]
  const profile = loadAzureConnectionProfile(id)
  let config: AzureConfig | null = null
  try { config = profile ? connectionConfig(profile) : null } catch { config = null }
  const busy = status?.state === 'busy'
  const refresh = <button className="primary" disabled={busy} onClick={() => void azure.fetchConnection(id)}>{busy ? 'Fetching…' : source ? 'Refresh from Azure' : 'Fetch from Azure'}</button>
  return <Page className="backlog-page">
    <Panel className="connection-panel backlog-panel">
      <div className="view-source-bar"><div><strong>{name}</strong><span className="muted"> · {config ? `${config.organization} / ${config.project}` : 'connection not found'}{source ? ` · ${source.items.length} items · fetched ${formatDateTime(source.fetchedAt)}` : ''}</span>{profile?.query ? <small className="muted"> · query</small> : config?.team ? <small className="muted"> · team {config.team}</small> : null}</div><div className="button-row">{refresh}<button className="ghost" onClick={onOpenConnection}>Connection settings</button></div></div>
      {status?.state === 'error' && <div className="notice error" role="alert">{status.message}</div>}
      {source && config ? <AzureWorkItemTree items={source.items} config={config} readOnly title={name} tabs={tabs} />
        : <>{tabs && <div className="backlog-toolbar">{tabs}</div>}<EmptyState title={config ? `“${name}” has not been fetched yet.` : `The connection for “${name}” is not saved in this browser.`} detail={config ? 'Fetch it read-only; nothing is written to Azure DevOps. Its items stay on this page and are not counted in Overview, Monthly Time Writing or My work.' : 'Add it again on the Azure DevOps page.'} /></>}
    </Panel>
  </Page>
}
