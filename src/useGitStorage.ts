import { useCallback, useEffect, useRef, useState } from 'react'
import type { useAppStore } from './store'
import { forgetGitStorage, GitConflictError, historyUrl, loadGitConfig, loadGitToken, planningData, readPlanningFile, readTextFile, saveGitConfig, saveGitToken, serializePlanning, siblingConfig, validateGitConfig, writePlanningFile, writeTextFile, type GitConfig } from './gitStorage'

export type GitStatus = 'off' | 'loading' | 'synced' | 'empty' | 'saving' | 'error' | 'conflict'

// Keeps baseline rules, release scopes and the resource mapping in a GitHub data file. Loads it on start when a
// repository and token are configured in this browser; saving is an explicit commit with a message.
export function useGitStorage(store: ReturnType<typeof useAppStore>, isSample: boolean) {
  const [config, setConfig] = useState<GitConfig | null>(() => loadGitConfig())
  const [token, setToken] = useState(() => loadGitToken())
  const [status, setStatus] = useState<GitStatus>(() => loadGitConfig() && loadGitToken() ? 'loading' : 'off')
  const [message, setMessage] = useState('')
  const [commitUrl, setCommitUrl] = useState('')
  const [synced, setSynced] = useState<string | null>(null)
  const sha = useRef<string | null>(null)
  const started = useRef(false)
  const current = serializePlanning(planningData(store.state))
  const connected = Boolean(config && token)
  const dirty = connected && synced != null && current !== synced

  const load = useCallback(async (target = config, key = token) => {
    if (!target || !key) return
    setStatus('loading'); setMessage(`Loading ${target.path} from ${target.owner}/${target.repo}…`)
    try {
      const file = await readPlanningFile(target, key)
      sha.current = file.sha
      if (!file.data) { setSynced(''); setStatus('empty'); setMessage(`${target.path} does not exist yet in ${target.owner}/${target.repo}. Save to create it from the data in this app.`); return }
      const data = file.data
      store.update((draft) => { draft.baselineRules = data.baselineRules; draft.releaseScopes = data.releaseScopes; draft.resourceProfiles = data.resourceProfiles; return draft })
      setSynced(serializePlanning(data)); setCommitUrl(historyUrl(target)); setStatus('synced'); setMessage(`Loaded from ${target.owner}/${target.repo} · ${target.path}`)
    } catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : String(error)) }
  }, [config, token, store])

  useEffect(() => {
    if (started.current || !store.ready || !config || !token) return
    started.current = true
    void load()
  }, [store.ready, config, token, load])

  async function connect(input: Partial<Record<keyof GitConfig, unknown>>, nextToken: string, remember: boolean) {
    let target: GitConfig
    try { target = validateGitConfig(input) } catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : String(error)); return }
    const key = nextToken.trim() || token
    if (!key) { setStatus('error'); setMessage('Enter a GitHub token with Contents: Read and write on the data repository.'); return }
    try { saveGitConfig(target); if (remember) saveGitToken(key) } catch { /* storage unavailable: keep for this session only */ }
    setConfig(target); setToken(key)
    await load(target, key)
  }

  async function save(commitMessage: string) {
    if (!config || !token) return
    if (isSample) { setStatus('error'); setMessage('Synthetic sample data is loaded. Saving to Git is disabled so sample mappings never reach the shared file.'); return }
    setStatus('saving'); setMessage('Saving to Git…')
    try {
      const data = planningData(store.state)
      const result = await writePlanningFile(config, token, data, sha.current, commitMessage)
      sha.current = result.sha
      setSynced(serializePlanning(data)); setCommitUrl(result.commitUrl); setStatus('synced'); setMessage(`Saved to ${config.owner}/${config.repo} · ${config.path}`)
    } catch (error) {
      setStatus(error instanceof GitConflictError ? 'conflict' : 'error'); setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  // The Azure DevOps views file (next to the data file): read the current version, then commit the new text.
  const viewsConfig = config ? siblingConfig(config, 'azure-views.json') : null
  async function readViews() {
    if (!viewsConfig || !token) throw new Error('Connect Git storage first.')
    return readTextFile(viewsConfig, token)
  }
  async function writeViews(text: string, commitMessage: string) {
    if (!viewsConfig || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const current = await readTextFile(viewsConfig, token)
    if (current.text === text) return { changed: false, commitUrl: historyUrl(viewsConfig) }
    return { changed: true, ...(await writeTextFile(viewsConfig, token, text, current.sha, commitMessage)) }
  }

  function disconnect() {
    try { forgetGitStorage() } catch { /* nothing stored */ }
    setConfig(null); setToken(''); setSynced(null); setStatus('off'); setMessage('Git storage disconnected in this browser. The data stays in the app and in the repository.'); sha.current = null
  }

  return { config, connected, status, message, dirty, commitUrl, history: config ? historyUrl(config) : '', isSample, load: () => load(), connect, save, disconnect, viewsPath: viewsConfig?.path ?? '', viewsHistory: viewsConfig ? historyUrl(viewsConfig) : '', readViews, writeViews }
}
export type GitStorage = ReturnType<typeof useGitStorage>
