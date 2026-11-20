import { useBulkEpic } from '../useStreamEpics'
import { epicFieldsFor } from '../epicSetup'
import { useEpicSetupFile } from '../useEpicSetup'
import { useCan } from '../useCan'
import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { AllEpicsDefaults } from './AllEpicsDefaults'
import { resolveFields, ioccSetsOf, type InheritField, type SetupOrigin, dpEpicId, releaseTypesOf, builtinMilestones, builtinSetup, copySetup, emptySetup, fillTitle, missingValues, placeholders, setupFor, setupsMissingDoD, defaultDoDFor, missingDoD, titleValues, type EpicSetup, type FeatureSetupFile } from '../featureSetup'
import { currentIndiaMonth } from '../azureDevOps'
import type { FeatureSetup } from '../useFeatureSetup'
import type { GitStorage } from '../useGitStorage'
import { EmptyState, Modal, Notice, Panel, Info } from './ui'

// Admin → Epic & Feature setup → Feature setup: per Epic, the optional User Stories offered when a Feature is created under it (all ticked
// by default) and the defaults of the month Time Writing Task. Two layers: "My setup" (feature-setup/<my email>.json,
// used only when I create a Feature, before the shared one) and "Shared" (feature-setup.json, everyone). Anyone whose
// Git token can write may edit either, and "Enable for everyone" copies my setup of an Epic into the shared one.
export function FeatureSetupPanel({ setup, git, items, qeColumnNames = [], initialEpicId = 0 }: { setup: FeatureSetup; git: GitStorage; items: AzureWorkItem[]; qeColumnNames?: string[]; initialEpicId?: number }) {
  // QV-59: the release-type sets and QE Mapping columns also belong to the Epics chosen for DP and IOCC bulk creation.
  const dpBulkEpic = useBulkEpic('DP').epicId, ioccBulkEpic = useBulkEpic('IOCC').epicId
  const epics = items.filter((item) => item.workItemType === 'Epic' && item.state.toLowerCase() !== 'removed').sort((a, b) => a.title.localeCompare(b.title))
  const [draft, setDraft] = useState<FeatureSetupFile | null>(null)
  const [epicId, setEpicId] = useState(initialEpicId)
  const [sample, setSample] = useState('Program | Service | v1.0')
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; url?: string } | null>(null)
  const [goTo, setGoTo] = useState('')
  const [copyTo, setCopyTo] = useState('')
  const [editing, setEditing] = useState(false)
  // Which layer is shown and edited: mine (default when my email is known) or the shared one.
  const [layer, setLayer] = useState<'mine' | 'shared'>(setup.email ? 'mine' : 'shared')
  const mine = layer === 'mine' && Boolean(setup.email)
  const base = mine ? setup.personal : setup.shared
  const file = draft ?? base ?? { schema: 1, kind: 'feature-setup', epics: [] }
  // CON-94: the shared layer needs "Edit the shared Feature setup"; my own layer only my Git token.
  const can = useCan()
  // EPS-02: the Epic setup's fields win over the title fields here (shown read-only, with where to edit them).
  const epicSetupFile = useEpicSetupFile()
  const editable = git.connected && !git.readOnly && !git.isSample && (mine ? Boolean(setup.email) : can('setup.feature'))
  const chosen = epicId || base?.epics[0]?.epicId || setup.shared?.epics[0]?.epicId || epics[0]?.id || 0
  const epicFields = epicFieldsFor(epicSetupFile, chosen)
  const sharedEntry = setupFor(setup.shared, chosen), myEntry = setupFor(setup.personal, chosen)
  const switchLayer = (next: 'mine' | 'shared') => { if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setResult(null); setLayer(next) }
  const sharedEditable = git.connected && !git.readOnly && !git.isSample && can('setup.feature')
  const draftMissing = draft ? setupsMissingDoD(draft, base) : []
  // The editor is a pop-up; closing it with unsaved changes asks first.
  const closeEditor = () => { if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setEditing(false) }
  const epic = epics.find((item) => item.id === chosen)
  const current = setupFor(file, chosen)
  const epicLabel = `#${chosen}${epic ? ` ${epic.title}` : current?.epicTitle ? ` ${current.epicTitle}` : ''}`
  // Which setup a new Feature under this Epic gets when I create it: mine, else the shared one, else the built-in milestones.
  const appliesNow: 'mine' | 'shared' | 'builtin' = myEntry ? 'mine' : sharedEntry ? 'shared' : 'builtin'
  const idOf = (text: string) => { const id = Number(text.trim().replace(/^#/, '')); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
  const jump = () => { const id = idOf(goTo); if (id) { if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setEpicId(id); setGoTo(''); setCopyTo(''); setResult(null) } }
  const startFromBuiltin = (kind: keyof typeof builtinMilestones) => { const next = structuredClone(file); next.epics = [...next.epics.filter((entry) => entry.epicId !== chosen), builtinSetup(chosen, epic?.title ?? '', kind)]; setDraft(next); setResult(null) }
  const copy = () => { const id = idOf(copyTo); if (!id || id === chosen) return; const target = epics.find((item) => item.id === id); if (setupFor(file, id) && !window.confirm(`Epic #${id} already has a setup here. Replace it with the setup of Epic #${chosen}?`)) return; setDraft(copySetup(file, chosen, id, target?.title ?? '')); setEpicId(id); setCopyTo(''); setResult({ tone: 'success', text: `Copied to Epic #${id}. Review it below and save to Git.` }) }
  const values = titleValues(sample, currentIndiaMonth(), current?.titleFields)
  const change = (update: (entry: EpicSetup) => void) => {
    const next = structuredClone(file)
    let entry = next.epics.find((item) => item.epicId === chosen)
    if (!entry) { entry = emptySetup(chosen, epic?.title ?? ''); next.epics.push(entry) }
    update(entry); entry.epicTitle = epic?.title ?? entry.epicTitle
    setDraft(next); setResult(null)
  }
  // CON-96: each inheritable field is set here or inherited from the layer above (for Mine: the Epic's shared setup;
  // then All Epics; then Built in), with Override and Revert.
  const inherited = resolveFields(mine && sharedEntry ? [{ entry: sharedEntry, origin: 'epic' }] : [], setup.shared?.defaults)
  const inh = (field: InheritField) => Boolean(current?.inherits?.includes(field))
  const originLabel: Record<SetupOrigin, string> = { mine: 'my setup', epic: 'the shared setup of this Epic', all: 'All Epics', builtin: 'Built in' }
  const fieldOrigin = (field: InheritField, name: string) => current && <span className="setup-origin">{inh(field)
    ? <><span className="scope-chip">Inherited from {originLabel[inherited.origin[field]]}</span>{editable && <button type="button" className="text-button" aria-label={`Override ${name}`} onClick={() => change((entry) => { entry.inherits = (entry.inherits ?? []).filter((item) => item !== field); if (!entry.inherits.length) delete entry.inherits; if (field === 'featureDoD') entry.featureDoD = inherited.featureDoD; else if (field === 'stories') entry.stories = structuredClone(inherited.stories); else if (inherited.originalEstimate != null) entry.task.originalEstimate = inherited.originalEstimate; else delete entry.task.originalEstimate })}>Override here</button>}</>
    : <><span className="scope-chip scope-you">Set here</span>{editable && <button type="button" className="text-button" aria-label={`Revert ${name} to inherited`} title={`Use ${originLabel[inherited.origin[field]]}: ${field === 'featureDoD' ? inherited.featureDoD || '—' : field === 'stories' ? inherited.stories.map((story) => story.title).join(', ') || 'none' : inherited.originalEstimate ?? 'none'}`} onClick={() => change((entry) => { entry.inherits = [...new Set([...(entry.inherits ?? []), field])] })}>Revert to inherited</button>}</>}</span>
  const preview = (template: string) => { const missing = missingValues(template, values); return missing.length ? `needs {${missing.join('}, {')}} — the sample title has no such part` : fillTitle(template, values) || '—' }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || draftMissing.length) return
    setBusy(true)
    try { const saved = mine ? await setup.savePersonal(draft, commit.trim() || `Update my Feature setup (${setup.email})`) : await setup.saveShared(draft, commit.trim() || 'Update the shared Feature setup'); setDraft(null); setEditing(false); setCommit(''); setResult({ tone: 'success', text: mine ? 'Your setup is saved to Git. It applies when you create a Feature.' : 'The shared setup is saved to Git. It applies to everyone without their own setup of the Epic.', url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  // Delete my / the shared setup of the chosen Epic straight away (one commit), after confirmation.
  async function deleteCurrent() {
    if (!current || !base || draft) return
    if (!window.confirm(`Delete ${mine ? 'your' : 'the shared'} Feature setup of Epic ${epicLabel} from Git now? ${mine ? (sharedEntry ? 'The shared setup then applies to you.' : 'The built-in milestones then apply.') : 'Features under it then use the built-in milestones (or a person\'s own setup).'}`)) return
    const next = { ...base, epics: base.epics.filter((entry) => entry.epicId !== chosen) }
    setBusy(true)
    try { const saved = mine ? await setup.savePersonal(next, `Delete my Feature setup of Epic #${chosen} (${setup.email})`) : await setup.saveShared(next, `Delete the shared Feature setup of Epic #${chosen}`); setResult({ tone: 'success', text: `${mine ? 'Your' : 'The shared'} Feature setup of Epic #${chosen} was deleted in Git.`, url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  // EPS-07: the old title fields moved to the Epic setup; saving the files again leaves them out.
  async function clearOldFields() {
    if (!window.confirm('Remove the old title fields from the shared Feature setup (and yours) in Git? The Epic setup holds the Feature fields now.')) return
    setBusy(true)
    try {
      if (setup.shared) await setup.saveShared(setup.shared, 'Remove the old title fields (moved to the Epic setup)')
      if (setup.personal && setup.email) await setup.savePersonal(setup.personal, `Remove my old title fields (${setup.email})`)
      setResult({ tone: 'success', text: 'The old title fields were removed from Git.' })
    } catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  async function enableForEveryone() {
    if (!myEntry || draft || !myEntry.featureDoD.trim()) return
    if (!window.confirm(`Enable your setup of Epic #${chosen} for everyone? It replaces the shared setup of this Epic.`)) return
    setBusy(true)
    try { const saved = await setup.enableForEveryone(myEntry); setResult({ tone: 'success', text: `Your setup of Epic #${chosen} is now the shared setup for everyone.`, url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }

  return <Panel className="admin-section" eyebrow="NEW FEATURES" title="Feature setup per Epic" info={<>When a Feature is created under an Epic, its optional User Stories (all ticked, untick what is not needed), the Time Writing User Story and the month Time Writing Task defaults come from here. An Epic without a setup keeps the PU / Full Release milestones. <strong>My setup</strong> is yours alone (Git: feature-setup/&lt;your email&gt;.json) and is used before the shared one when you create a Feature. <strong>Shared</strong> is for everyone without their own setup of the Epic (Git: feature-setup.json). <strong>Enable for everyone</strong> copies your setup of the Epic into the shared one. Saving needs a Git token that can write; personal files sit in the same repository, so anyone with access to it can read them.{setup.history && <> <a href={setup.history} target="_blank" rel="noreferrer">History</a></>}</>}
    action={<div className="button-row">
      <div className="segmented" role="group" aria-label="Which setup">{setup.email && <button type="button" aria-pressed={mine} onClick={() => switchLayer('mine')}>My setup</button>}<button type="button" aria-pressed={!mine} onClick={() => switchLayer('shared')}>Shared (everyone)</button></div>
      {git.connected && <button type="button" className="ghost" onClick={() => { if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setResult(null); void setup.reload() }}>Reload from Git</button>}
    </div>}>
    <p className="muted setup-layer">{mine ? <>Your own setup ({setup.email}). It is used only when <strong>you</strong> create a Feature, before the shared one.</> : <>The shared setup, used by everyone who has no setup of their own for the Epic.</>}</p>
    {!setup.email && <Notice tone="info">Set your email on the Time Writing connection to keep a setup of your own; until then only the shared setup is shown.</Notice>}
    {!git.connected && <Notice tone="info">Connect Git storage (Admin → Data & sharing) to share the Feature setup.{setup.shared || setup.personal ? ' The setup last loaded in this browser is used meanwhile.' : ''}</Notice>}
    {git.connected && git.readOnly && <Notice tone="info">View only: your Git token can read but not save.</Notice>}
    {setup.error && <Notice tone="error">Feature setup: {setup.error}</Notice>}
    <AllEpicsDefaults setup={setup} editable={sharedEditable} />
    {sharedEditable && setup.shared && <div className="button-row"><button type="button" className="ghost" disabled={busy} title="The old title fields are no longer used: the Epic setup holds the Feature fields. This saves the shared setup (and yours) again without them." onClick={() => void clearOldFields()}>Remove the old title fields from Git</button></div>}
    <div className="setup-jump"><label>Go to Epic #<input inputMode="numeric" value={goTo} placeholder="e.g. 13946" onChange={(event) => setGoTo(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); jump() } }} /></label><button type="button" className="ghost" disabled={!idOf(goTo)} onClick={jump}>Open</button></div>
    {chosen > 0 && <div className="setup-flow" role="group" aria-label={`Which setup applies to Epic #${chosen}`}>
      <p><strong>When you create a Feature under Epic {epicLabel}</strong>, the first of these that exists is used:</p>
      <ol>
        <li className={appliesNow === 'mine' ? 'setup-flow-on' : ''}><strong>My setup</strong> of this Epic{setup.email ? '' : ' (needs your email on the Time Writing connection)'} — {myEntry ? `${myEntry.stories.length} optional User Stor${myEntry.stories.length === 1 ? 'y' : 'ies'}` : 'none'}{mine && draft && current ? <em className="setup-unsaved"> · changed here, not saved yet: save to Git to apply</em> : null}</li>
        <li className={appliesNow === 'shared' ? 'setup-flow-on' : ''}><strong>Shared setup</strong> of this Epic — {sharedEntry ? `${sharedEntry.stories.length} optional User Stor${sharedEntry.stories.length === 1 ? 'y' : 'ies'}` : 'none'}{!mine && draft && current ? <em className="setup-unsaved"> · changed here, not saved yet: save to Git to apply</em> : null}</li>
        <li><strong>All Epics</strong> — for the fields a setup above leaves to it (Feature DoD, optional User Stories, default estimate){setup.shared?.defaults ? '' : ' — none set'}</li>
        <li className={appliesNow === 'builtin' ? 'setup-flow-on' : ''}><strong>Built-in</strong> — you choose PU (SFV, DT, IQOQ) or Full Release (PRD, SFV, DT, IQOQ) in the New Feature form</li>
      </ol>
      <p className="muted">Applies now: <strong>{appliesNow === 'mine' ? 'my setup' : appliesNow === 'shared' ? 'the shared setup' : 'the built-in milestones'}</strong>. The Time Writing User Story and the month Task are always created.</p>
    </div>}
    {!epics.length && !chosen ? <EmptyState title="No Epics loaded yet." detail="Fetch the Time Writing connection; its Epics appear here." /> : <>
      <div className="setup-summary">
        <label>Epic<select value={chosen} onChange={(event) => setEpicId(Number(event.target.value))}>{!epic && chosen > 0 && <option value={chosen}>#{chosen}{current?.epicTitle ? ` ${current.epicTitle}` : ' (not in the fetched data)'}</option>}{epics.map((item) => <option key={item.id} value={item.id}>{setupFor(file, item.id) ? '● ' : ''}#{item.id} {item.title}{mine && !setupFor(file, item.id) && setupFor(setup.shared, item.id) ? ' (shared)' : ''}</option>)}</select></label>
        <div><span className="field-label">{current ? `${mine ? 'My' : 'Shared'} setup of this Epic` : 'No setup of this Epic here'}</span><p>{current ? <>{current.featureDoD.trim() ? <>DoD “{current.featureDoD.trim()}” · </> : <span className="warning-text">Feature DoD missing · </span>}{current.stories.length ? current.stories.map((entry) => entry.title || '(untitled)').join(' · ') : 'No optional User Stories'} · Month Task {current.task.originalEstimate != null ? `${current.task.originalEstimate}h` : 'without default hours'}</> : mine && sharedEntry ? 'The shared setup applies (see above).' : 'The built-in milestones apply (see above).'}</p></div>
        <div className="button-row"><button type="button" className="primary" onClick={() => { setResult(null); if (editable && current && missingDoD(current)) change((entry) => { entry.featureDoD = defaultDoDFor(entry) }); setEditing(true) }}>{editable ? current ? 'Edit setup…' : 'Create setup…' : 'View setup…'}</button>{editable && current && <button type="button" className="text-button danger-text" disabled={busy || Boolean(draft)} onClick={() => void deleteCurrent()}>Delete setup</button>}</div>
      </div>
      {mine && editable && can('setup.feature') && myEntry && !draft && <div className="button-row setup-share"><button type="button" className="ghost" disabled={busy || !myEntry.featureDoD.trim()} onClick={() => void enableForEveryone()} title={myEntry.featureDoD.trim() ? 'Copies your setup of this Epic into the shared setup' : 'Add the Feature DoD to your setup first'}>Enable for everyone</button><small className="muted">{sharedEntry ? 'Replaces the shared setup of this Epic.' : 'This Epic has no shared setup yet.'}</small></div>}
      {editing && <Modal title={`${mine ? 'My' : 'Shared'} Feature setup · Epic ${epicLabel}`} eyebrow={editable ? 'SETTINGS · FEATURE SETUP' : 'SETTINGS · FEATURE SETUP · VIEW ONLY'} wide form onClose={closeEditor}>
        <label>Preview with Feature title<input value={sample} onChange={(event) => setSample(event.target.value)} /></label>
      <p className="info-line"><Info label="Placeholders">Placeholders: {placeholders.map((key) => `{${key}}`).join(' ')} — {'{feature}'} is the whole title; {'{program}'}, {'{service}'}, {'{version}'} are its parts for titles like “Program | Service | v1.2”; {'{month}'} is e.g. “{currentIndiaMonth()}”; an Epic with title fields also has {'{Field}'} for each (any letter case, spaces ignored). Text without placeholders is used as typed. ● marks Epics with a setup.</Info></p>
      <fieldset className="plain-fieldset feature-setup" disabled={!editable || busy}>
        {mine && !current && sharedEntry && <Notice tone="info">You use the shared setup of this Epic. <button type="button" className="text-button" onClick={() => { const next = structuredClone(file); next.epics.push(structuredClone(sharedEntry)); setDraft(next); setResult(null) }}>Start my own from the shared one</button></Notice>}
        {!current && <div className="setup-builtin"><p><strong>No {mine ? 'personal' : 'shared'} setup of Epic {epicLabel} yet.</strong> Start from the built-in stories (editable afterwards):</p><div className="button-row"><button type="button" className="ghost" onClick={() => startFromBuiltin('Release')}>Use built-in Full Release ({builtinMilestones.Release.join(', ')})</button><button type="button" className="ghost" onClick={() => startFromBuiltin('PU')}>Use built-in PU ({builtinMilestones.PU.join(', ')})</button></div></div>}
        {fieldOrigin('featureDoD', 'Feature DoD')}
        <label className="setup-dod">Feature DoD (Definition of Done) — required<textarea rows={2} required={!inh('featureDoD')} disabled={inh('featureDoD')} maxLength={100000} value={inh('featureDoD') ? inherited.featureDoD : current?.featureDoD ?? ''} placeholder="e.g. IQOQ finished and Checklist uploaded into the Feature." onChange={(event) => change((entry) => { entry.featureDoD = event.target.value })} /><small>A new Feature under this Epic starts with it as “Feature DoD: …” at the top of its Description; it can be changed when creating.</small></label>
        {!inh('featureDoD') && !current?.featureDoD.trim() && <div className="button-row"><button type="button" className="text-button" onClick={() => change((entry) => { entry.featureDoD = defaultDoDFor(entry) })}>Use the default: “{defaultDoDFor(current ?? { stories: [] })}”</button></div>}
        <h3>Feature fields</h3>
        <p className="muted">{epicFields ? <>From the Epic setup of #{epicFields.epicId}: {epicFields.fields.map((field) => field.label).join(', ')} (Admin → Epic & Feature setup).</> : <>None for this Epic: Feature fields (Program, Platform…) are set per Epic in Admin → Epic & Feature setup.</>}</p>
        <h3>Optional User Stories</h3>
        {fieldOrigin('stories', 'Optional User Stories')}
        {inh('stories') && <ul className="setup-inherited">{inherited.stories.length ? inherited.stories.map((story, index) => <li key={index}>{story.title}</li>) : <li className="muted">None</li>}</ul>}
        {!inh('stories') && <>
        {!current?.stories.length && <p className="muted">{current ? 'No optional User Stories: only the Time Writing story and Task are created.' : mine && sharedEntry ? 'No setup of your own for this Epic: the shared one applies (see above).' : 'No setup for this Epic yet: Features under it use the PU / Full Release milestones. Add a User Story or set the Task defaults to start one.'}</p>}
        {current?.stories.map((story, index) => <div key={index} className="setup-story">
          <label>Title<input value={story.title} maxLength={255} onChange={(event) => change((entry) => { entry.stories[index].title = event.target.value })} /><small className="muted">→ {preview(story.title)}</small></label>
          <label>Description<textarea rows={2} value={story.description} onChange={(event) => change((entry) => { entry.stories[index].description = event.target.value })} /></label>
          <div className="button-row"><button type="button" className="ghost" aria-label="Move up" disabled={index === 0} onClick={() => change((entry) => { [entry.stories[index - 1], entry.stories[index]] = [entry.stories[index], entry.stories[index - 1]] })}>↑</button><button type="button" className="ghost" aria-label="Move down" disabled={index === current.stories.length - 1} onClick={() => change((entry) => { [entry.stories[index + 1], entry.stories[index]] = [entry.stories[index], entry.stories[index + 1]] })}>↓</button><button type="button" className="text-button" onClick={() => change((entry) => { entry.stories.splice(index, 1) })}>Remove</button></div>
        </div>)}
        <button type="button" className="ghost" onClick={() => change((entry) => { entry.stories.push({ title: '', description: '' }) })}>＋ Add optional User Story</button>
        </>}
        {/* DPF-01…02: the DP Epic's sets per release type and the QE Mapping columns (Release Details → DP, Create Features). */}
        {current && (chosen === dpEpicId || chosen === dpBulkEpic || chosen === ioccBulkEpic) && <div className="setup-dp">
          <h3>{chosen === ioccBulkEpic && chosen !== dpBulkEpic ? 'IOCC releases' : 'DP releases'} <Info>Release Details → DP (and IOCC, QV-59) reads the release type from the version x.y.z.a: X.0.0.0 Major and x.y.0.0 Minor use the Release set; x.y.z.0 MLD and x.y.z.a Platform Update use the PU set. Create Features uses that set's DoD and User Stories, and assigns everything to the release's QE from the QE Mapping.</Info></h3>
          {(['release', 'pu'] as const).map((kind) => { const setsOf = chosen === ioccBulkEpic && chosen !== dpBulkEpic && chosen !== dpEpicId ? ioccSetsOf : releaseTypesOf; const set = setsOf(current)[kind]; const edit = (update: (next: { featureDoD: string; stories: { title: string; description: string }[] }) => void) => change((entry) => { const types = structuredClone(setsOf(entry)); update(types[kind]); entry.releaseTypes = types }); return <div key={kind} className="setup-dp-type">
            <h4>{kind === 'release' ? 'Release (Major, Minor)' : 'PU (MLD, Platform Update)'}</h4>
            <label>Feature DoD<textarea rows={2} maxLength={100000} value={set.featureDoD} aria-label={`${kind === 'release' ? 'Release' : 'PU'} Feature DoD`} onChange={(event) => edit((next) => { next.featureDoD = event.target.value })} /></label>
            <label>Default User Stories (one title per line)<textarea rows={4} aria-label={`${kind === 'release' ? 'Release' : 'PU'} default User Stories`} value={set.stories.map((story) => story.title).join('\n')} onChange={(event) => edit((next) => { next.stories = event.target.value.split('\n').map((title) => ({ title, description: next.stories.find((story) => story.title === title)?.description ?? '' })) })} /><small className="muted">→ {set.stories.filter((story) => story.title.trim()).map((story) => preview(story.title)).join(' · ') || 'none'}</small></label>
          </div> })}
          <div className="form-row">
            <label>QE Mapping column with the Platform / Product / Project / Service{qeColumnNames.length ? <select aria-label="QE Mapping product column" value={current.qeColumns?.matchColumn ?? ''} onChange={(event) => change((entry) => { entry.qeColumns = { matchColumn: event.target.value, qeColumn: entry.qeColumns?.qeColumn ?? '' } })}><option value="">Choose…</option>{qeColumnNames.map((name) => <option key={name} value={name}>{name}</option>)}</select> : <input aria-label="QE Mapping product column" value={current.qeColumns?.matchColumn ?? ''} placeholder="e.g. Product" onChange={(event) => change((entry) => { entry.qeColumns = { matchColumn: event.target.value, qeColumn: entry.qeColumns?.qeColumn ?? '' } })} />}</label>
            <label>QE Mapping column with the QE{qeColumnNames.length ? <select aria-label="QE Mapping QE column" value={current.qeColumns?.qeColumn ?? ''} onChange={(event) => change((entry) => { entry.qeColumns = { matchColumn: entry.qeColumns?.matchColumn ?? '', qeColumn: event.target.value } })}><option value="">Choose…</option>{qeColumnNames.map((name) => <option key={name} value={name}>{name}</option>)}</select> : <input aria-label="QE Mapping QE column" value={current.qeColumns?.qeColumn ?? ''} placeholder="e.g. QE Name" onChange={(event) => change((entry) => { entry.qeColumns = { matchColumn: entry.qeColumns?.matchColumn ?? '', qeColumn: event.target.value } })} />}</label>
          </div>
          {!qeColumnNames.length && <p className="muted">Open Data &amp; governance → QE Mapping once to list its columns here.</p>}
        </div>}
        <h3>Time Writing <Info>The same for every Epic (BKL-28): the person's month Task “&lt;Month&gt; | &lt;Feature&gt;” under “&lt;Feature&gt; - Time Writing” (their own Time Writing story first), assigned to the person, in the Feature's Area Path and the project root iteration; an existing month Task of theirs is reused. Only the default planned hours are set per Epic.</Info></h3>
        <div className="form-row">
          <label>Default Original Estimate (hours) of a new month Task {fieldOrigin('estimate', 'Default Original Estimate')}<input type="number" min="0" max="1000000" step="0.25" disabled={inh('estimate')} value={inh('estimate') ? inherited.originalEstimate ?? '' : current?.task.originalEstimate ?? ''} placeholder="None" onChange={(event) => change((entry) => { const value = event.target.value.trim(); if (value === '') delete entry.task.originalEstimate; else if (Number.isFinite(Number(value)) && Number(value) >= 0) entry.task.originalEstimate = Number(value) })} /><small className="muted">Hours typed when creating win; an existing Task keeps its hours.</small></label>
        </div>
        {current && <button type="button" className="text-button" onClick={() => { const next = structuredClone(file); next.epics = next.epics.filter((entry) => entry.epicId !== chosen); setDraft(next); setResult(null) }}>{mine ? `Delete my setup of this Epic (${sharedEntry ? 'use the shared one' : 'back to PU / Full Release'})` : 'Delete the shared setup of this Epic (back to PU / Full Release)'}</button>}
      </fieldset>
      {editable && current && <div className="button-row setup-copy"><label>Copy this setup to Epic #<input inputMode="numeric" value={copyTo} placeholder="e.g. 13946" onChange={(event) => setCopyTo(event.target.value)} /></label><button type="button" className="ghost" disabled={!idOf(copyTo) || idOf(copyTo) === chosen} onClick={copy}>Copy</button></div>}
      {editable && draft && <form className="git-bar git-bar-dirty" onSubmit={save}>
        <span><strong>Unsaved {mine ? 'personal' : 'shared'} Feature setup</strong> — not yet in Git</span>
        <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change" />
        <button type="button" className="ghost" disabled={busy} onClick={() => { setDraft(null); setResult(null) }}>Discard</button>
        <button className="primary" disabled={busy || draftMissing.length > 0} title={draftMissing.length ? 'Every changed setup needs its Feature DoD' : undefined}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
        {editable && draftMissing.length > 0 && <Notice tone="warning">The Feature DoD is mandatory: add it for Epic {draftMissing.map((id) => `#${id}`).join(', ')} to save.</Notice>}
        {result?.tone === 'error' && <Notice tone="error">{result.text}</Notice>}
        {!draft && <div className="modal-actions"><button type="button" className="primary" onClick={closeEditor}>Close</button></div>}
      </Modal>}
    </>}
    {result && !(editing && result.tone === 'error') && <Notice tone={result.tone}>{result.text}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
  </Panel>
}
