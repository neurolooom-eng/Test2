import type { ReactNode } from 'react'
import { Notice, Pill } from './ui'
import { formatDateTime } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'

// One status strip for every page that reads the Azure backlog: scope, freshness, refresh, preview save/discard, errors and messages.
export function AzureSourceBar({ azure, onOpenConnection, showRefresh = true, children }: { azure: AzureWorkspace; onOpenConnection?: () => void; showRefresh?: boolean; children?: ReactNode }) {
  const { config, items, preview, busy, pat, lastRefreshed, error, message, needsScopedRefresh } = azure
  const tone = busy ? 'info' : preview ? 'warning' : items.length ? 'open' : 'neutral'
  const label = busy ? 'Fetching…' : preview ? 'Unsaved preview' : items.length ? 'Saved data' : 'No data'
  return <>
    <div className="source-bar">
      <div className="source-bar-facts"><Pill tone={tone}>{label}</Pill><span><strong>{config?.team || 'No team selected'}</strong> · {items.length} work items</span><span className="muted">{lastRefreshed ? `Refreshed ${formatDateTime(lastRefreshed)}` : 'Saved data is a snapshot, not a live subscription.'}</span></div>
      <div className="button-row">{children}{showRefresh && <button className="primary" disabled={busy || !config || !pat.trim()} onClick={() => void azure.refresh()}>{busy ? 'Refreshing…' : 'Refresh from Azure'}</button>}{onOpenConnection && <button className="ghost" onClick={onOpenConnection}>Connection settings</button>}</div>
    </div>
    {preview && <Notice tone="warning" className="notice-split"><span>Showing {preview.items.length} fetched records from {preview.scope.team}’s Epic backlog hierarchy. Saving replaces the previous Azure cache, including out-of-scope records; export a JSON backup first if you need it.</span><div className="button-row"><button className="primary" onClick={azure.savePreview}>Save preview — replace Azure cache</button><button className="ghost" onClick={() => { azure.setPreview(null); azure.setMessage('Preview discarded. Previously saved work items are unchanged.') }}>Discard</button></div></Notice>}
    {needsScopedRefresh && !preview && <Notice>Previously cached work items have no verified scope for this team backlog and are hidden. Refresh from Azure, then save the scoped result to replace the old cache. Other app data is unchanged.</Notice>}
    {!items.length && !busy && !preview && onOpenConnection && <Notice>No source data loaded yet. <button className="text-button" onClick={onOpenConnection}>Fetch work items from Azure DevOps →</button></Notice>}
    {error && <Notice tone="error">{error} Previously loaded data has been retained.</Notice>}
    {message && <Notice>{message}</Notice>}
  </>
}
