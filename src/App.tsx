import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useAppStore } from './store'
import { effectiveActualsOpen, effectivePlanningOpen } from './rules'
import { Notice, Pill } from './components/ui'
import { Clock, ThemeToggle } from './components/Clock'
import { pages, pageGroups, pageMeta, type Page } from './pages/registry'
import { DashboardPage } from './pages/DashboardPage'
import { ActivitiesPage } from './pages/ActivitiesPage'
import { MonthlyPage } from './pages/MonthlyPage'
import { BaselinesPage } from './pages/BaselinesPage'
import { ReleasesPage } from './pages/ReleasesPage'
import { MigrationPage } from './pages/MigrationPage'
import { SnapshotsPage } from './pages/SnapshotsPage'
import { AdminPage } from './pages/AdminPage'
import { AzureDevOpsPage } from './pages/AzureDevOpsPage'
import { BoardPage } from './pages/BoardPage'
import { useAzureWorkspace } from './useAzureWorkspace'
import { useGitStorage } from './useGitStorage'
import { useMyWork } from './useMyWork'
import { MyWorkPage } from './pages/MyWorkPage'
import { DesktopDownload } from './components/DesktopDownload'
import { useNow } from './useNow'
import { exportStateJson } from './download'
import { BuildStatus } from './components/BuildStatus'
import { mergeAzureWorkItems } from './azureDevOps'
import { indiaMonth } from './azureInsights'
import { monthName, relativeTime } from './format'

export default function App() {
  const store = useAppStore()
  const azure = useAzureWorkspace(store)
  const git = useGitStorage(store, azure.isSample)
  const my = useMyWork(azure, store)
  const now = useNow(30000)
  const [page, setPage] = useState<Page>('overview')
  const [month, setMonth] = useState(() => indiaMonth(new Date().toISOString())!)
  const period = useMemo(() => store.state.periods.find((item) => item.month === month) ?? store.state.periods[0], [month, store.state.periods])
  const planningOpen = period ? effectivePlanningOpen(period) : true
  const actualsOpen = period ? effectiveActualsOpen(period) : true
  const meta = pageMeta(page)
  const sampleRequested = useRef(new URLSearchParams(window.location.search).get('sample') === '1')
  useEffect(() => {
    if (!store.ready || !sampleRequested.current) return
    sampleRequested.current = false
    if (!(store.state.azureWorkItems?.length)) azure.loadSampleData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready])
  const openConnection = () => setPage('azure')
  const pageProps = { store, month, setMonth }
  const buildStatus = <BuildStatus pending={store.hasPendingSave} failed={store.ready && (store.cache.status === 'error' || (store.connection.mode === 'sharepoint' && ['error', 'conflict'].includes(store.connection.status)))} busy={azure.busy} preview={Boolean(azure.preview)} onBackup={store.ready ? () => exportStateJson({ ...store.state, azureWorkItems: mergeAzureWorkItems(store.state.azureWorkItems ?? [], azure.preview?.items ?? []), ...(azure.preview ? { azureBacklogScope: azure.preview.scope } : {}) }) : undefined} />
  const storageTone = store.connection.mode === 'sharepoint' ? 'open' : store.cache.status === 'error' || store.connection.status === 'error' || store.connection.status === 'conflict' ? 'danger' : 'neutral'
  const storageLabel = store.connection.mode === 'sharepoint' ? '● Live SharePoint' : store.cache.status === 'error' ? '⚠ Not saved locally' : store.cache.status === 'saving' ? '◌ Saving locally' : '○ Local IndexedDB'

  if (!store.ready) return <main className="content"><h1>Demand Planning</h1>{store.loadError ? <Notice tone="error"><p>{store.loadError}</p><p>Do not clear browser data. If you still have an older tab open with unsaved changes, export its JSON backup first.</p><button className="primary" onClick={store.retryLoad}>Retry loading saved data</button></Notice> : <p role="status">Loading saved browser data…</p>}{buildStatus}</main>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">DP</div><div><strong>Demand Planning</strong><span>Quality Engineering</span></div></div>
      <nav aria-label="Primary navigation">{pageGroups.map((group) => <div key={group} className="nav-section">{group !== 'Overview' && <p className="nav-group">{group.toUpperCase()}</p>}{pages.filter((item) => item.group === group).map((item) => <button key={item.id} className={page === item.id ? 'nav-active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'mywork' && my.pending.length > 0 && <span className="nav-badge" aria-label={`${my.pending.length} pending`}>{my.pending.length}</span>}</button>)}</div>)}</nav>
      <div className="sidebar-footer"><DesktopDownload />{buildStatus}</div>
    </aside>
    <main>
      <header className="topbar"><div><p className="eyebrow">{(meta.usesMonth ? monthName(month) : meta.group).toUpperCase()}</p><h1>{meta.label}</h1><p className="page-detail">{meta.detail}</p></div><div className="topbar-actions"><Clock />{my.known && page !== 'mywork' && <button type="button" className="pending-pill" onClick={() => setPage('mywork')} title="Your pending Azure DevOps work"><b>{my.pending.length}</b> pending</button>}<Pill tone={storageTone}><span title={azure.lastRefreshed ? `Azure data refreshed ${new Date(azure.lastRefreshed).toLocaleString()}` : 'Azure data not refreshed in this session'}>{storageLabel}{azure.lastRefreshed ? ` · Azure ${relativeTime(azure.lastRefreshed, now)}` : ''}</span></Pill><label className="month-picker">Month<input type="month" value={month} onChange={(event) => /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && setMonth(event.target.value)} /></label>{page !== 'overview' && <><Pill tone={planningOpen ? 'open' : 'locked'}>Planning {planningOpen ? 'open' : 'locked'}</Pill><Pill tone={actualsOpen ? 'open' : 'locked'}>Actuals {actualsOpen ? 'open' : 'locked'}</Pill></>}<ThemeToggle /></div></header>
      {store.cache.status === 'error' && <Notice tone="error"><p>{store.cache.message}</p><div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export JSON backup now</button><button className="primary" onClick={store.retrySave}>Retry browser save</button></div></Notice>}
      {store.connection.mode !== 'sharepoint' && store.connection.status === 'error' && <Notice tone="error">{store.connection.message}</Notice>}
      {page === 'overview' && <DashboardPage month={month} azure={azure} navigate={setPage} store={store} setMonth={setMonth} my={my} />}
      {page === 'mywork' && <MyWorkPage azure={azure} store={store} my={my} onOpenConnection={openConnection} />}
      {page === 'activities' && <ActivitiesPage azure={azure} onOpenConnection={openConnection} />}
      {page === 'monthly' && <MonthlyPage azure={azure} month={month} store={store} onOpenConnection={openConnection} />}
      {page === 'baselines' && <BaselinesPage azure={azure} month={month} store={store} git={git} onOpenConnection={openConnection} onOpenSettings={() => setPage('admin')} />}
      {page === 'releases' && <ReleasesPage azure={azure} month={month} store={store} onOpenConnection={openConnection} />}
      {page === 'board' && <BoardPage azure={azure} onOpenConnection={openConnection} />}
      {page === 'azure' && <AzureDevOpsPage azure={azure} store={store} onOpenBoard={() => setPage('board')} />}
      {page === 'migration' && <MigrationPage {...pageProps} />}
      {page === 'snapshots' && <SnapshotsPage {...pageProps} />}
      {page === 'admin' && <AdminPage {...pageProps} azure={azure} git={git} onOpenConnection={openConnection} />}
    </main>
  </div>
}
