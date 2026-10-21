import { useState } from 'react'
import { loadWindchillSettings, windchillServiceUrl } from './windchill'
import { buildWindchillQuery, loadWindchillViews, parseWindchillPage, windchillSearchUrl, saveWindchillViews, validateWindchillView, type WindchillView } from './windchillViews'
import type { WindchillSource } from './windchillSnapshots'
import { queryWindchillInBrowser } from './windchillBrowser'
import type { GitStorage } from './useGitStorage'
import type { PageProps } from './pages/types'

// Windchill views: their searches (this browser), fetching them (desktop app, or the browser itself with its own
// Windchill sign-in), and importing the results opened in the browser (where the company sign-in works). Each result is stored with the app data and, with Git storage
// connected, saved to Git for the web app.
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
    if (!settings.host) { fail('Set the Windchill host in Settings → Windchill first.'); return }
    let path: string
    try { path = buildWindchillQuery(view) } catch (error) { fail(error instanceof Error ? error.message : String(error)); return }
    setStatus((current) => ({ ...current, [id]: { state: 'busy', message: 'Searching Windchill…' } }))
    try {
      const { rows } = window.windchill?.query ? await window.windchill.query({ host: settings.host, servicePath: settings.servicePath, path }) : await queryWindchillInBrowser(windchillServiceUrl(settings), path)
      const source: WindchillSource = { viewId: view.id, name: view.name, fetchedAt: new Date().toISOString(), query: path, columns: view.columns, rows }
      store.update((draft) => { draft.windchillSources = [...(draft.windchillSources ?? []).filter((entry) => entry.viewId !== id), source]; return draft })
      setStatus((current) => ({ ...current, [id]: { state: 'ok', message: `${rows.length} result${rows.length === 1 ? '' : 's'} saved.` } }))
      if (git.connected) void git.pushWindchill(view, source)
    } catch (error) { fail(error instanceof Error ? error.message : String(error)) }
  }
  // The search address to open in the browser; '' until the host is set and the view is valid.
  function searchUrl(id: string) {
    const view = views.find((entry) => entry.id === id), settings = loadWindchillSettings()
    if (!view || !settings.host) return ''
    try { return windchillSearchUrl(windchillServiceUrl(settings), view) } catch { return '' }
  }
  // Results saved or copied from the browser: replace the view's results, or add the next page to them.
  function importView(id: string, text: string, nextPage = false) {
    const view = views.find((entry) => entry.id === id)
    if (!view) return
    const settings = loadWindchillSettings()
    const fail = (message: string) => setStatus((current) => ({ ...current, [id]: { state: 'error', message } }))
    if (!settings.host) { fail('Set the Windchill host in Settings → Windchill first.'); return }
    let page: ReturnType<typeof parseWindchillPage>, query: string
    try { page = parseWindchillPage(text, windchillServiceUrl(settings)); query = buildWindchillQuery(view) } catch (error) { fail(error instanceof Error ? error.message : String(error)); return }
    const previous = sources.find((entry) => entry.viewId === id)
    const rows = nextPage && previous ? [...previous.rows, ...page.rows] : page.rows
    if (rows.length > 20000) { fail('More than 20,000 results. Narrow the filters.'); return }
    const source: WindchillSource = { viewId: view.id, name: view.name, fetchedAt: new Date().toISOString(), query, columns: view.columns, rows, ...(page.next ? { next: page.next } : {}) }
    store.update((draft) => { draft.windchillSources = [...(draft.windchillSources ?? []).filter((entry) => entry.viewId !== id), source]; return draft })
    const count = (value: number) => `${value} result${value === 1 ? '' : 's'}`
    setStatus((current) => ({ ...current, [id]: { state: 'ok', message: `${count(page.rows.length)} imported${nextPage ? `, ${count(rows.length)} in total` : ''}.${page.next ? ' Windchill has more: open the next page, save it and use Import next page.' : ''}` } }))
    if (git.connected) void git.pushWindchill(view, source)
  }
  return { views, sources, status, desktop, reload: () => setViews(loadWindchillViews()), saveView, removeView, fetchView, searchUrl, importView }
}
export type WindchillWorkspace = ReturnType<typeof useWindchill>
