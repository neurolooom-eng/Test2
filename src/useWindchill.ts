import { useState } from 'react'
import { loadWindchillSettings } from './windchill'
import { buildWindchillQuery, loadWindchillViews, saveWindchillViews, validateWindchillView, type WindchillView } from './windchillViews'
import type { WindchillSource } from './windchillSnapshots'
import type { GitStorage } from './useGitStorage'
import type { PageProps } from './pages/types'

// Windchill views: their searches (this browser) and fetching them from the desktop app. Each fetch is stored with the
// app data and, with Git storage connected, saved to Git for the web app.
export function useWindchill(store: PageProps['store'], git: GitStorage) {
  const [views, setViews] = useState<WindchillView[]>(loadWindchillViews)
  const [status, setStatus] = useState<Record<string, { state: 'busy' | 'ok' | 'error'; message: string }>>({})
  const desktop = Boolean(window.windchill?.query)
  const sources = store.state.windchillSources ?? []

  function saveView(input: WindchillView) {
    const view = validateWindchillView(input)
    const next = [...views.filter((entry) => entry.id !== view.id), view]
    saveWindchillViews(next); setViews(next)
    return view
  }
  function removeView(id: string) {
    const next = views.filter((entry) => entry.id !== id)
    saveWindchillViews(next); setViews(next)
    store.update((draft) => { draft.windchillSources = (draft.windchillSources ?? []).filter((source) => source.viewId !== id); return draft })
  }
  async function fetchView(id: string) {
    const view = views.find((entry) => entry.id === id)
    if (!view) return
    const settings = loadWindchillSettings()
    const fail = (message: string) => setStatus((current) => ({ ...current, [id]: { state: 'error', message } }))
    if (!window.windchill?.query) { fail('Windchill searches run in the desktop app; the web app shows the results saved to Git.'); return }
    if (!settings.host) { fail('Set the Windchill host in Settings → Windchill first.'); return }
    let path: string
    try { path = buildWindchillQuery(view) } catch (error) { fail(error instanceof Error ? error.message : String(error)); return }
    setStatus((current) => ({ ...current, [id]: { state: 'busy', message: 'Searching Windchill…' } }))
    try {
      const { rows } = await window.windchill.query({ host: settings.host, servicePath: settings.servicePath, path })
      const source: WindchillSource = { viewId: view.id, name: view.name, fetchedAt: new Date().toISOString(), query: path, columns: view.columns, rows }
      store.update((draft) => { draft.windchillSources = [...(draft.windchillSources ?? []).filter((entry) => entry.viewId !== id), source]; return draft })
      setStatus((current) => ({ ...current, [id]: { state: 'ok', message: `${rows.length} result${rows.length === 1 ? '' : 's'} saved.` } }))
      if (git.connected) void git.pushWindchill(view, source)
    } catch (error) { fail(error instanceof Error ? error.message : String(error)) }
  }
  return { views, sources, status, desktop, reload: () => setViews(loadWindchillViews()), saveView, removeView, fetchView }
}
export type WindchillWorkspace = ReturnType<typeof useWindchill>
