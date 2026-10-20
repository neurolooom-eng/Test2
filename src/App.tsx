import { useEffect, useRef, useState } from 'react'
import './App.css'
import { useAppStore } from './store'
import { Notice } from './components/ui'
import { ThemeToggle } from './components/Clock'
import { DataNotices, DataStatus } from './components/DataStatus'
import { pages, pageGroups, pageMeta, type Page } from './pages/registry'
import { DashboardPage } from './pages/DashboardPage'
import { MonthlyPage } from './pages/MonthlyPage'
import { BaselinesPage } from './pages/BaselinesPage'
import { SnapshotsPage } from './pages/SnapshotsPage'
import { AdminPage } from './pages/AdminPage'
import { BoardPage } from './pages/BoardPage'
import { useAzureWorkspace } from './useAzureWorkspace'
import { useGitStorage } from './useGitStorage'
import { useMyWork } from './useMyWork'
import { MyWorkPage } from './pages/MyWorkPage'
import { DesktopDownload } from './components/DesktopDownload'
import { exportStateJson } from './download'
import { BuildStatus } from './components/BuildStatus'
import { backlogViews, loadBacklogTab, saveBacklogTab, timeWritingView } from './backlogViews'
import { mergeAzureWorkItems } from './azureDevOps'
import { indiaMonth } from './azureInsights'

export default function App() {
  const store = useAppStore()
  const azure = useAzureWorkspace(store)
  const git = useGitStorage(store, azure.isSample)
  const my = useMyWork(azure, store)
  const [page, setPage] = useState<Page>('overview')
  const [month, setMonth] = useState(() => indiaMonth(new Date().toISOString())!)
  const meta = pageMeta(page)
  const sampleRequested = useRef(new URLSearchParams(window.location.search).get('sample') === '1')
  useEffect(() => {
    if (!store.ready || !sampleRequested.current) return
    sampleRequested.current = false
    if (!(store.state.azureWorkItems?.length)) azure.loadSampleData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready])
  // Azure DevOps views: connections marked "Show in menu", each in the sidebar and as a tab.
  const views = backlogViews(azure.connectionProfiles, azure.activeConnectionProfileId)
  const timeWriting = timeWritingView(azure.connectionProfiles, azure.activeConnectionProfileId)
  const [viewId, setViewId] = useState(loadBacklogTab)
  const view = views.find((entry) => entry.id === viewId) ?? views[0] ?? timeWriting
  const openView = (id: string) => { setViewId(id); saveBacklogTab(id); setPage('board') }
  // Azure DevOps connections live at the top of Settings.
  const openConnection = () => setPage('admin')
  const pageProps = { store, month, setMonth }
  const buildStatus = <BuildStatus pending={store.hasPendingSave} failed={store.ready && (store.cache.status === 'error' || (store.connection.mode === 'sharepoint' && ['error', 'conflict'].includes(store.connection.status)))} busy={azure.busy} preview={Boolean(azure.preview)} onBackup={store.ready ? () => exportStateJson({ ...store.state, azureWorkItems: mergeAzureWorkItems(store.state.azureWorkItems ?? [], azure.preview?.items ?? []), ...(azure.preview ? { azureBacklogScope: azure.preview.scope } : {}) }) : undefined} />
  const storageLabel = store.connection.mode === 'sharepoint' ? '● Live SharePoint' : store.cache.status === 'error' ? '⚠ Not saved locally' : store.cache.status === 'saving' ? '◌ Saving locally' : '○ Local IndexedDB'

  if (!store.ready) return <main className="content"><h1>Demand Planning</h1>{store.loadError ? <Notice tone="error"><p>{store.loadError}</p><p>Do not clear browser data. If you still have an older tab open with unsaved changes, export its JSON backup first.</p><button className="primary" onClick={store.retryLoad}>Retry loading saved data</button></Notice> : <p role="status">Loading saved browser data…</p>}{buildStatus}</main>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">DP</div><div><strong>Demand Planning</strong><span>Quality Engineering</span></div></div>
      <nav aria-label="Primary navigation">{pageGroups.filter((group) => group !== 'Azure DevOps' || views.length > 0).map((group) => <div key={group} className="nav-section">{group !== 'Overview' && <p className="nav-group">{group.toUpperCase()}</p>}{pages.filter((item) => item.group === group).flatMap((item) => item.id === 'board' ? views.map((entry) => <button key={entry.id} className={page === 'board' && view.id === entry.id ? 'nav-active' : ''} aria-current={page === 'board' && view.id === entry.id ? 'page' : undefined} onClick={() => openView(entry.id)}><span className="nav-icon">{item.icon}</span>{entry.name}</button>) : [<button key={item.id} className={page === item.id ? 'nav-active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'mywork' && my.pending.length > 0 && <span className="nav-badge" aria-label={`${my.pending.length} pending`}>{my.pending.length}</span>}</button>])}</div>)}</nav>
      <div className="sidebar-footer"><DesktopDownload /><small className="storage-line" title="Where app data is saved">{storageLabel}</small>{buildStatus}</div>
    </aside>
    <main>
      <header className="topbar"><h1 title={meta.detail}>{page === 'board' ? view.name : meta.label}</h1><div className="topbar-actions"><DataStatus azure={azure} />{meta.usesMonth && <label className="month-picker"><span className="sr-only">Month</span><input type="month" aria-label="Month" value={month} onChange={(event) => /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && setMonth(event.target.value)} /></label>}<ThemeToggle /></div></header>
      <DataNotices azure={azure} onOpenConnection={openConnection} />
      {store.cache.status === 'error' && <Notice tone="error"><p>{store.cache.message}</p><div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export JSON backup now</button><button className="primary" onClick={store.retrySave}>Retry browser save</button></div></Notice>}
      {store.connection.mode !== 'sharepoint' && store.connection.status === 'error' && <Notice tone="error">{store.connection.message}</Notice>}
      {page === 'overview' && <DashboardPage month={month} azure={azure} navigate={setPage} store={store} setMonth={setMonth} my={my} />}
      {page === 'mywork' && <MyWorkPage azure={azure} store={store} my={my} />}
      {page === 'monthly' && <MonthlyPage azure={azure} month={month} store={store} my={my} />}
      {page === 'baselines' && <BaselinesPage azure={azure} month={month} store={store} git={git} onOpenSettings={() => setPage('admin')} />}
      {page === 'board' && <BoardPage azure={azure} store={store} current={view} onOpenConnection={openConnection} />}
      {page === 'snapshots' && <SnapshotsPage {...pageProps} />}
      {page === 'admin' && <AdminPage {...pageProps} azure={azure} git={git} onOpenBoard={() => setPage('board')} />}
    </main>
  </div>
}
