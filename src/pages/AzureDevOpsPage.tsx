import { useState } from 'react'
import { EmptyState, Notice, Page, Panel, Pill, type Tone } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import { formatDateTime } from '../format'
import { loadAzureConnectionProfile, splitAzureUrl, splitCollectionUrl, type AzureConnectionProfileSummary, type AzureConnectionRole } from '../azureCredentials'
import { defaultReleaseQuery, projectQuery } from '../releaseSource'
import type { AzureWorkspace, ConnectionInput } from '../useAzureWorkspace'
import type { PageProps } from './types'

const roleLabel: Record<AzureConnectionRole, string> = { 'time-tracking': 'Time Writing (read & write)', 'release-source': 'Releases · DHFI (read only)', documents: 'Documents · Vault (read only)', reference: 'Reference (read only)' }
const roleUse: Record<AzureConnectionRole, string> = {
  'time-tracking': 'Feeds the Overview, Monthly Time Writing and Baselines. Without a query the team’s Epic backlog is read; with a query its results plus their parents are read. One Time Writing connection is active at a time.',
  'release-source': 'Approved documents whose Area Path carries the release identifier; feeds Feature milestones and completed releases.',
  documents: 'Document source such as Vault; fetched read-only and kept for document counts per release.',
  reference: 'Any other read-only data: fetched and listed with its count.',
}
const queryPlaceholder: Record<AzureConnectionRole, string> = { 'time-tracking': 'Optional. Leave empty to read the team Epic backlog.', 'release-source': defaultReleaseQuery, documents: projectQuery, reference: projectQuery }
const empty = (role: AzureConnectionRole = 'time-tracking'): ConnectionInput => ({ name: '', role, serverUrl: '', organization: '', project: '', team: '', pat: '', query: '', creatorEmail: '', apiVersion: '' })

export function AzureDevOpsPage({ azure, store, onOpenBoard }: { azure: AzureWorkspace; store: PageProps['store']; onOpenBoard: () => void }) {
  const { connectionProfiles, connectionStatus, activeConnectionProfileId, preview, busy } = azure
  const [form, setForm] = useState<ConnectionInput | null>(null)
  const [formError, setFormError] = useState('')
  const [fetchingAll, setFetchingAll] = useState(false)
  const sources = store.state.azureSources ?? []
  const releaseSource = store.state.releaseSource

  function edit(profile: AzureConnectionProfileSummary) {
    const parts = splitAzureUrl(profile.url, profile.baseUrl)
    const { serverUrl, organization } = splitCollectionUrl(parts.baseUrl)
    setFormError(''); setForm({ id: profile.id, name: profile.reason, role: profile.role, serverUrl, organization, project: parts.project, team: parts.team, pat: '', query: profile.query ?? '', creatorEmail: profile.creatorEmail ?? '', apiVersion: profile.apiVersion ?? '' })
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    try { azure.saveConnection(form); setForm(null); setFormError('') } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Unable to save the connection.') }
  }
  const lastFetch = (profile: AzureConnectionProfileSummary) => {
    if (profile.role === 'release-source') return releaseSource ? `${releaseSource.items.length} documents · ${formatDateTime(releaseSource.fetchedAt)}` : ''
    if (profile.role === 'time-tracking') return profile.id === activeConnectionProfileId && azure.saved.length ? `${azure.saved.length} saved work items` : ''
    const source = sources.find((entry) => entry.connectionId === profile.id)
    return source ? `${source.items.length} work items · ${formatDateTime(source.fetchedAt)}` : ''
  }
  const statusTone = (profile: AzureConnectionProfileSummary): [Tone, string] => {
    const status = connectionStatus[profile.id]
    if (status?.state === 'busy') return ['info', 'Fetching…']
    if (status?.state === 'error') return ['danger', 'Failed']
    if (status?.state === 'ok') return ['open', status.message.startsWith('Connection works') ? 'Connected' : 'Fetched']
    return lastFetch(profile) ? ['open', 'Data saved'] : ['neutral', 'Not fetched']
  }

  return <Page intro="Each connection is one set: base URL (Azure DevOps Services or an on-prem Azure DevOps Server collection), project, PAT and an optional query, plus what its data is used for. Add as many as you need; Fetch all reads every connection read-only, one after another. PATs stay in this browser and are excluded from backups, SharePoint and Git."
    actions={<button className="primary" onClick={onOpenBoard}>Open Backlogs →</button>}>
    <AzureSourceBar azure={azure} showRefresh={false}>{preview && <button className="ghost" onClick={onOpenBoard}>Review in Backlogs →</button>}</AzureSourceBar>
    <Panel className="connection-panel" eyebrow="AZURE DEVOPS" title="Connections" detail="Time Writing previews before saving; release, document and reference connections are saved as soon as they are fetched. Nothing is written to Azure DevOps when fetching."
      action={<div className="button-row"><button type="button" className="ghost" onClick={() => { setFormError(''); setForm(empty(connectionProfiles.some((profile) => profile.role === 'time-tracking') ? 'reference' : 'time-tracking')) }}>＋ Add connection</button><button type="button" className="primary" disabled={!connectionProfiles.length || fetchingAll || busy} onClick={() => { setFetchingAll(true); void azure.fetchAll().finally(() => setFetchingAll(false)) }}>{fetchingAll ? 'Fetching all…' : 'Fetch all'}</button></div>}>
      {connectionProfiles.length ? <div className="azure-table"><table className="connection-table"><thead><tr><th>Connection</th><th>Used for</th><th>Organization / project</th><th>Query</th><th>Status</th><th /></tr></thead><tbody>{connectionProfiles.map((profile) => {
        const parts = splitAzureUrl(profile.url, profile.baseUrl), [tone, label] = statusTone(profile), status = connectionStatus[profile.id]
        const active = profile.role === 'time-tracking' && profile.id === activeConnectionProfileId
        return <tr key={profile.id}>
          <td><strong>{profile.reason}</strong>{active && <small>Active Time Writing source</small>}</td>
          <td>{roleLabel[profile.role]}</td>
          <td>{parts.baseUrl.replace('https://', '')}{profile.baseUrl && <Pill tone="info">On-prem</Pill>}<small>{parts.project}{parts.team ? ` · team ${parts.team}` : ''}{profile.apiVersion ? ` · API ${profile.apiVersion}` : ''}</small></td>
          <td>{profile.query ? <span className="query-chip" title={profile.query}>Custom query</span> : <small>{profile.role === 'time-tracking' ? 'Team Epic backlog' : 'Default'}</small>}</td>
          <td><Pill tone={tone}>{label}</Pill><small>{status?.message ?? lastFetch(profile)}</small></td>
          <td><div className="button-row nowrap"><button type="button" className="ghost" disabled={status?.state === 'busy' || fetchingAll} onClick={() => void azure.fetchConnection(profile.id)}>Fetch</button><button type="button" className="ghost" disabled={status?.state === 'busy' || fetchingAll} onClick={() => void azure.testConnection(profile.id)}>Test</button><button type="button" className="ghost" onClick={() => edit(profile)}>Edit</button><button type="button" className="text-button" onClick={() => { if (window.confirm(`Remove “${profile.reason}” from this browser? Its PAT is not revoked in Azure DevOps.`)) azure.removeConnection(profile.id) }}>Remove</button></div></td>
        </tr>
      })}</tbody></table></div>
        : <EmptyState title="No connections yet." detail="Add your Time Writing project first, then the DHFI release source and any other read-only sources." />}
      {form && <form className="connection-editor" onSubmit={submit}>
        <h3>{form.id ? `Edit “${connectionProfiles.find((profile) => profile.id === form.id)?.reason ?? form.name}”` : 'New connection'}</h3>
        <div className="connection-form">
          <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Time Writing, DHFI releases, Vault" /></label>
          <label>Used for<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AzureConnectionRole })}>{(Object.keys(roleLabel) as AzureConnectionRole[]).map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}</select></label>
          <label>Server URL (on-prem only)<input type="url" value={form.serverUrl} onChange={(event) => setForm({ ...form, serverUrl: event.target.value })} placeholder="Empty for dev.azure.com · e.g. https://tfs.company.com/tfs" /><small>Leave empty for Azure DevOps Services. On-prem: the server address without the collection.</small></label>
          <label>Organization / collection<input required value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} placeholder={form.serverUrl.trim() ? 'e.g. DHPCollection' : 'Azure DevOps organization'} /><small>{form.serverUrl.trim() ? 'On-prem this is the collection name.' : 'The name after dev.azure.com/.'}</small></label>
          <label>Project<input required value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })} placeholder="Project name" /></label>
          {form.role === 'time-tracking' && <label>Team{form.query.trim() ? ' (optional with a query)' : ''}<input value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })} placeholder="Team whose Epic backlog is read" /></label>}
          <label>API version (optional)<input value={form.apiVersion} onChange={(event) => setForm({ ...form, apiVersion: event.target.value })} placeholder="Automatic" /><small>Leave empty to detect it: 7.1, then 6.0 and 5.0 for older Azure DevOps Server.</small></label>
          <label>PAT{form.id ? ' (leave empty to keep the saved one)' : ''}<input type="password" autoComplete="off" required={!form.id || !loadAzureConnectionProfile(form.id)} value={form.pat} onChange={(event) => setForm({ ...form, pat: event.target.value })} placeholder={form.role === 'time-tracking' ? 'Work Items (Read & Write)' : 'Work Items (Read)'} /></label>
          {form.role === 'time-tracking' && <label>Feature creator email (optional)<input type="email" value={form.creatorEmail} onChange={(event) => setForm({ ...form, creatorEmail: event.target.value })} placeholder="Assigned to Features created from the app" /></label>}
          <label className="query-field">Query (optional, WIQL)<textarea rows={4} spellCheck={false} value={form.query} onChange={(event) => setForm({ ...form, query: event.target.value })} placeholder={queryPlaceholder[form.role]} /><small>A flat query: SELECT … FROM WorkItems WHERE …. Only the WHERE clause is used; results are read in pages. {form.role === 'time-tracking' ? '' : 'Empty uses the default shown.'}</small></label>
        </div>
        <Notice>{roleUse[form.role]}</Notice>
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="button-row"><button className="primary">Save connection</button><button type="button" className="ghost" onClick={() => setForm(null)}>Cancel</button></div>
      </form>}
    </Panel>
    {sources.length > 0 && <Panel className="connection-panel" eyebrow="READ ONLY" title="Fetched read-only sources" detail="Snapshots from document and reference connections, stored with the app data.">
      <div className="azure-table"><table><thead><tr><th>Connection</th><th>Project</th><th>Work items</th><th>By type</th><th>Fetched</th></tr></thead><tbody>{sources.map((source) => {
        const types = Object.entries(source.items.reduce<Record<string, number>>((counts, item) => { counts[item.workItemType] = (counts[item.workItemType] ?? 0) + 1; return counts }, {})).sort((a, b) => b[1] - a[1])
        return <tr key={source.connectionId}><td><strong>{source.name}</strong><small>{roleLabel[source.role]}</small></td><td>{source.organization} / {source.project}</td><td>{source.items.length}</td><td>{types.slice(0, 4).map(([type, count]) => `${type} ${count}`).join(' · ') || '—'}</td><td>{formatDateTime(source.fetchedAt)}</td></tr>
      })}</tbody></table></div>
    </Panel>}
    <Panel className="connection-panel" eyebrow="DEMO" title="Synthetic sample" detail="Replaces the cached Time Writing data and release source with a generated dataset, without reading from or writing to Azure DevOps.">
      <div className="button-row"><button type="button" className="ghost" disabled={busy} onClick={() => { if (azure.saved.length && !azure.isSample && !window.confirm('Replace the saved Azure cache with a synthetic sample dataset? Export a JSON backup first if you need the current data.')) return; azure.loadSampleData() }}>Load synthetic sample dataset</button></div>
    </Panel>
  </Page>
}
