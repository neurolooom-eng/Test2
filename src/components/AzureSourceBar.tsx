import type { ReactNode } from 'react'
import { Notice, Pill } from './ui'
import { formatDateTime, relativeTime } from '../format'
import { useNow } from '../useNow'
import type { AzureWorkspace } from '../useAzureWorkspace'

// One status strip for every page that reads the Azure backlog: scope, freshness, refresh, preview save/discard, errors and messages.
export function AzureSourceBar({ azure, onOpenConnection, showRefresh = true, children }: { azure: AzureWorkspace; onOpenConnection?: () => void; showRefresh?: boolean; children?: ReactNode }) {
  const { config, items, preview, busy, pat, lastRefreshed, error, message, needsScopedRefresh, isSample } = azure
  const now = useNow(30000)
  const tone = busy ? 'info' : preview ? 'warning' : isSample ? 'warning' : items.length ? 'open' : 'neutral'
  const label = busy ? 'Fetching…' : preview ? 'Unsaved preview' : isSample ? 'Synthetic sample' : items.length ? 'Saved data' : 'No data'
  const savedAt = !lastRefreshed && items.length ? items.reduce((latest, item) => item.syncedAt > latest ? item.syncedAt : latest, '') : ''
  const freshness = lastRefreshed ? `Refreshed ${relativeTime(lastRefreshed, now)}` : savedAt ? `Saved data fetched ${relativeTime(savedAt, now)}` : 'Saved data is a snapshot, not a live subscription.'
  return <>
    <div className="source-bar">
      <div className="source-bar-facts"><Pill tone={tone}>{label}</Pill><span><strong>{config?.team || 'No team selected'}</strong> · {items.length} work items</span><span className="muted freshness" title={lastRefreshed || savedAt ? `${formatDateTime(lastRefreshed || savedAt)} in your time zone` : undefined}>{freshness}</span></div>
      <div className="button-row">{children}{showRefresh && <button className="primary" disabled={busy || !config || !pat.trim()} onClick={() => void azure.refresh()}>{busy ? 'Refreshing…' : 'Refresh from Azure'}</button>}{onOpenConnection && <button className="ghost" onClick={onOpenConnection}>Connection settings</button>}</div>
    </div>
    {preview && <Notice tone="warning" className="notice-split"><span>Showing {preview.items.length} fetched records from {preview.scope.team}’s Epic backlog hierarchy. Saving replaces the previous Azure cache, including out-of-scope records; export a JSON backup first if you need it.</span><div className="button-row"><button className="primary" onClick={azure.savePreview}>Save preview — replace Azure cache</button><button className="ghost" onClick={() => { azure.setPreview(null); azure.setMessage('Preview discarded. Previously saved work items are unchanged.') }}>Discard</button></div></Notice>}
    {needsScopedRefresh && !preview && <Notice>Previously cached work items have no verified scope for this team backlog and are hidden. Refresh from Azure, then save the scoped result to replace the old cache. Other app data is unchanged.</Notice>}
    {!items.length && !busy && !preview && onOpenConnection && <Notice className="notice-split"><span>No source data loaded yet. <button className="text-button" onClick={onOpenConnection}>Fetch work items from Azure DevOps →</button></span><button className="ghost" onClick={azure.loadSampleData}>Load synthetic sample</button></Notice>}
    {isSample && <Notice tone="warning">Showing a synthetic sample dataset, not Azure DevOps data. Refresh from Azure to replace it.</Notice>}
    {error && <Notice tone="error">{error} Previously loaded data has been retained.</Notice>}
    {message && <Notice>{message}</Notice>}
  </>
}
