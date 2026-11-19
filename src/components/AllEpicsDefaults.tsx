import { useState } from 'react'
import { defaultDoDFor, type SetupDefaults } from '../featureSetup'
import type { FeatureSetup } from '../useFeatureSetup'
import { Notice } from './ui'

// CON-95 All Epics: defaults for every Epic's setup (shared, in feature-setup.json) — Feature DoD, optional User
// Stories, default estimate of the month Task — used where an Epic's setup (shared or mine) inherits the field.
export function AllEpicsDefaults({ setup, editable }: { setup: FeatureSetup; editable: boolean }) {
  const saved = setup.shared?.defaults ?? {}
  const [draft, setDraft] = useState<SetupDefaults | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const shown = draft ?? saved
  const change = (next: SetupDefaults) => { setDraft(next); setResult(null) }
  const set = <K extends keyof SetupDefaults>(key: K, value: SetupDefaults[K] | undefined) => { const next = { ...shown }; if (value === undefined || value === '') delete next[key]; else next[key] = value; change(next) }
  async function save() {
    if (!draft) return
    setBusy(true)
    try { await setup.saveShared({ schema: 1, kind: 'feature-setup', epics: setup.shared?.epics ?? [], defaults: draft }, 'Update the Feature setup defaults for all Epics'); setDraft(null); setResult({ tone: 'success', text: 'Saved to Git.' }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  const count = Object.keys(saved).length
  return <details className="setup-all-epics">
    <summary><strong>All Epics</strong> — defaults every Epic's setup can inherit {count ? `(${count} set)` : '(none set: Built in applies)'}</summary>
    <p className="muted">An Epic's setup (shared or yours) takes each of these from the nearest layer that sets it: Mine → the Epic's shared setup → All Epics → Built in. In the setup of an Epic, “Revert to inherited” hands a field back to the layer above.</p>
    <fieldset className="plain-fieldset" disabled={!editable || busy}>
      <label>Feature DoD<textarea aria-label="All Epics Feature DoD" rows={2} maxLength={100000} value={shown.featureDoD ?? ''} placeholder={`Built in: the PU or Full Release DoD, e.g. “${defaultDoDFor({ stories: [] })}”`} onChange={(event) => set('featureDoD', event.target.value)} /></label>
      <label>Optional User Stories (one title per line)<textarea aria-label="All Epics optional User Stories" rows={3} value={(shown.stories ?? []).map((story) => story.title).join('\n')} placeholder="Built in: none" onChange={(event) => { const titles = event.target.value.split('\n'); set('stories', event.target.value.trim() ? titles.map((title, index) => ({ title, description: shown.stories?.[index]?.description ?? '' })) : undefined) }} /></label>
      <label>Default Original Estimate (hours) of a new month Task<input aria-label="All Epics default estimate" type="number" min="0" max="1000000" step="0.25" value={shown.originalEstimate ?? ''} placeholder="Built in: none" onChange={(event) => { const value = event.target.value.trim(); set('originalEstimate', value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? undefined : Number(value)) }} /></label>
    </fieldset>
    {!editable && <p className="muted">View only: changed by roles allowed “Edit the shared Feature setup”, with a Git token that can write.</p>}
    {editable && draft && <div className="git-bar git-bar-dirty"><span><strong>Unsaved All Epics defaults</strong> — not yet in Git</span><button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setResult(null) }}>Discard</button><button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save to Git'}</button></div>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
  </details>
}
