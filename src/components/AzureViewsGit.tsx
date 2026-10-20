import { useState } from 'react'
import { listAzureConnectionProfiles } from '../azureCredentials'
import { parseViews, restoreViews, serializeViews, viewsFile } from '../viewDefinitions'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import { Notice, Panel } from './ui'

// Settings: keep the Azure DevOps connections (view names, queries, URLs, roles) in the Git data repository and
// restore them on another computer. PATs are never written to Git.
export function AzureViewsGitPanel({ git, azure }: { git: GitStorage; azure: AzureWorkspace }) {
  const [busy, setBusy] = useState('')
  const [pat, setPat] = useState('')
  const [commit, setCommit] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null)
  const count = azure.connectionProfiles.length

  async function save() {
    setBusy('save'); setNotice(null)
    try {
      const text = serializeViews(viewsFile(listAzureConnectionProfiles()))
      const result = await git.writeViews(text, commit || `Azure DevOps views: ${count} connection${count === 1 ? '' : 's'}`)
      setCommit('')
      setNotice(result.changed ? { tone: 'success', text: `${count} connection${count === 1 ? '' : 's'} saved to ${git.viewsPath} (no PATs).` } : { tone: 'info', text: `${git.viewsPath} is already up to date.` })
    } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not save the views to Git.' }) }
    finally { setBusy('') }
  }

  async function restore() {
    setBusy('restore'); setNotice(null)
    try {
      const file = await git.readViews()
      if (file.text == null) { setNotice({ tone: 'warning', text: `${git.viewsPath} does not exist in Git yet. Save the views first.` }); return }
      const views = parseViews(file.text)
      if (!window.confirm(`Restore ${views.length} connection${views.length === 1 ? '' : 's'} from Git? Connections with the same ID are overwritten (their PAT is kept); others here are not touched.`)) return
      const result = restoreViews(views, pat)
      azure.reloadConnectionProfiles(); setPat('')
      const parts = [result.added.length && `${result.added.length} added`, result.updated.length && `${result.updated.length} updated`].filter(Boolean).join(', ')
      setNotice({ tone: result.skipped.length ? 'warning' : 'success', text: `${parts || 'Nothing restored'}.${result.skipped.length ? ` Not restored, no PAT for: ${result.skipped.join(', ')} — enter a PAT above and restore again.` : ''} Refresh each view to load its data.` })
    } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not restore the views from Git.' }) }
    finally { setBusy('') }
  }

  return <Panel className="connection-panel admin-section" eyebrow="AZURE DEVOPS" title="Views in Git" detail="Keep the Azure DevOps connections — view names, queries, project URLs, on-prem servers and roles — in the Git data repository, next to the planning data, and restore them on another computer. PATs are never written to Git: a restored connection keeps the PAT it has here, or uses the PAT entered below, or one saved here for the same organisation or server.">
    {!git.connected ? <Notice tone="warning">Connect Git storage above to save the views.</Notice> : <>
      <div className="connection-form">
        <label className="wide-field">Change description<input value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="e.g. Add DP, CP and IOCC queries" /></label>
        <label className="wide-field">PAT for restored connections (optional)<input type="password" autoComplete="off" value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Only needed for connections with no PAT in this browser" /></label>
        <div className="connection-actions"><button type="button" className="primary" disabled={Boolean(busy) || !count} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : `Save ${count} connection${count === 1 ? '' : 's'} to Git`}</button><button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void restore()}>{busy === 'restore' ? 'Restoring…' : 'Restore from Git'}</button></div>
      </div>
      <p className="muted">File: {git.viewsPath} · <a href={git.viewsHistory} target="_blank" rel="noreferrer">history in GitHub</a></p>
    </>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
  </Panel>
}
