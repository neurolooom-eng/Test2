import { useState, useSyncExternalStore } from 'react'
import { isRunning, runInBackground, subscribeJobs } from '../backgroundJobs'
import { addComment, createUserStory, currentIterationPairs, ensureAbsenceStoryMonthTask, ensureMonthTask, ensureStoryMonthTask, readAzureIterations, updateAzureTimeWritingEffort } from '../azureDevOps'
import { timeWritingMonth } from '../azureInsights'
import { capacityContext } from '../capacity'
import { PersonPicker } from '../components/PersonPicker'
import { EmptyState, Page } from '../components/ui'
import type { AzureWorkItem } from '../domain'
import { formatDate, monthName } from '../format'
import { absenceStoryType, isMine, leaveTaskCandidates, monthTaskCandidates, type MonthTaskCandidate } from '../myWork'
import { actualsLockDate, actualsLocked as isActualsLocked, planLockDate, planningLocked as isPlanningLocked } from '../planningLock'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import { useNow } from '../useNow'
import type { PageProps } from './types'

// My Activities (ACT-02…ACT-07): one page for a person's month — this month's activities with their planned and actual
// hours (the ones still to add ticked, like copying last month's), a new activity under a stream and Feature, and the
// month's progress with the deadline. Every write uses the existing month-task rules (no duplicates, the lock days, the
// person's own stories) and goes to Azure DevOps only.

type Hours = { planned?: string; actual?: string }
type Row = {
  key: string
  title: string
  stream: string
  kind: 'work' | 'leave' | 'training'
  task?: AzureWorkItem
  candidate?: MonthTaskCandidate
  // The item the row's ID links to in Azure DevOps (its Feature, or a leave / training story).
  link?: AzureWorkItem
}
const hoursText = (value?: number) => value == null ? '' : String(value)
const validHours = (text: string) => text.trim() === '' || (Number.isFinite(Number(text)) && Number(text) >= 0 && Number(text) <= 1000)
const adhocTask = (task: AzureWorkItem) => task.tags.split(';').some((tag) => tag.trim().toLowerCase() === 'ad-hoc')

export function MyActivitiesPage({ azure, store, my, month, assign, onOpen }: { azure: AzureWorkspace; store: PageProps['store']; my: MyWork; month: string; assign?: { me: string; canChoose: boolean }; onOpen: (page: 'mywork' | 'bulk' | 'monthly') => void }) {
  const now = useNow(60000)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [hours, setHours] = useState<Record<string, Hours>>({})
  const [stream, setStream] = useState('')
  const [featureId, setFeatureId] = useState('')
  const [newHours, setNewHours] = useState<Hours>({})
  // Add a new activity adds a Time Writing task, or a User Story (title, description, an optional first comment).
  const [addKind, setAddKind] = useState<'task' | 'story'>('task')
  const [story, setStory] = useState({ title: '', description: '', comment: '' })
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const saving = useSyncExternalStore(subscribeJobs, () => isRunning('activities:save'))
  const label = monthName(month)
  const locks = capacityContext(store.state)
  const absenceEpicId = locks.absenceEpicId
  const planLocked = isPlanningLocked(locks, month, now), actualLocked = isActualsLocked(locks, month, now)
  const assignee = (assign?.me || azure.creatorEmail).trim().toLowerCase()
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: nothing is saved to Azure DevOps.' : !azure.config || !azure.pat.trim() ? 'Connect the Time Writing connection (with its PAT) to save to Azure DevOps.' : !assignee ? 'Set your work email (Settings → Azure DevOps) so new tasks are assigned to you.' : ''

  // The parent chain of an item, nearest first.
  const byId = new Map(azure.items.map((item) => [item.id, item]))
  const chainOf = (item: AzureWorkItem) => { const chain: AzureWorkItem[] = []; for (let next = item.parentId == null ? undefined : byId.get(item.parentId); next && chain.length < 6; next = next.parentId == null ? undefined : byId.get(next.parentId)) chain.push(next); return chain }
  const featureOf = (item: AzureWorkItem) => item.workItemType === 'Feature' ? item : chainOf(item).find((entry) => entry.workItemType === 'Feature')
  const epicOf = (item: AzureWorkItem) => item.workItemType === 'Epic' ? item : chainOf(item).find((entry) => entry.workItemType === 'Epic')
  const kindOf = (item: AzureWorkItem): Row['kind'] => epicOf(item)?.id !== absenceEpicId ? 'work' : [item, ...chainOf(item)].some((entry) => entry.workItemType === 'User Story' && absenceStoryType(entry) === 'Training') || absenceStoryType(item) === 'Training' ? 'training' : 'leave'

  // This month's tasks of mine, then the Features still without one (work ticked, leave and training not).
  const mine = my.known ? azure.items.filter((item) => item.workItemType === 'Task' && item.state.trim().toLowerCase() !== 'removed' && isMine(item, my.me) && timeWritingMonth(item.title) === month) : []
  const existing: Row[] = mine.map((task) => { const feature = featureOf(task); return { key: `task:${task.id}`, title: feature?.title ?? task.title, stream: epicOf(task)?.title ?? 'No stream', kind: kindOf(task), task, link: feature ?? task } })
  const work = my.known ? monthTaskCandidates(azure.items, my.me, label, absenceEpicId) : []
  const leave = my.known ? leaveTaskCandidates(azure.items, my.me, label, absenceEpicId) : []
  const toAdd: Row[] = [...work, ...leave].filter((row) => row.status === 'needs-task' || row.status === 'needs-story').map((row) => ({
    key: row.story ? `story:${row.story.id}` : row.kind ? `feature:${row.feature.id}:${row.kind}` : `feature:${row.feature.id}`,
    title: row.leave ? row.story?.title ?? row.storyTitle : row.feature.title,
    link: row.story ?? row.feature,
    stream: epicOf(row.feature)?.title ?? 'No stream',
    kind: !row.leave ? 'work' : row.kind === 'Training' ? 'training' : 'leave',
    candidate: row,
  }))
  const conflicts = work.filter((row) => row.status === 'conflict')
  const isTicked = (row: Row) => ticked[row.key] ?? row.kind === 'work'
  const valueOf = (row: Row, field: keyof Hours) => hours[row.key]?.[field] ?? (row.task ? hoursText(field === 'planned' ? row.task.originalEstimate : row.task.completedWork) : '')
  const setValue = (row: Row, field: keyof Hours, text: string) => setHours((current) => ({ ...current, [row.key]: { ...current[row.key], [field]: text } }))
  const changedExisting = existing.filter((row) => (['planned', 'actual'] as const).some((field) => hours[row.key]?.[field] != null && hours[row.key]![field] !== hoursText(field === 'planned' ? row.task!.originalEstimate : row.task!.completedWork)))
  const chosenNew = toAdd.filter(isTicked)
  const pendingCount = changedExisting.length + chosenNew.length

  // Progress: a work or training activity counts as updated once it has actual hours; leave counts once it exists.
  const tracked = [...existing, ...toAdd.filter((row) => row.kind === 'work')]
  const updated = existing.filter((row) => (row.task!.completedWork ?? 0) > 0 || row.kind === 'leave').length
  const percent = tracked.length ? Math.round((updated / tracked.length) * 100) : 0
  const planDay = planLockDate(locks, month), actualsDay = actualsLockDate(locks, month)
  const deadline = planLocked ? actualsDay : planDay
  const daysLeft = Math.ceil((new Date(`${deadline}T23:59:59`).getTime() - now.getTime()) / 86400000)

  // Add a new activity: a stream (Epic) and a pending Feature under it; mine first.
  // Streams are the Active Epics (the absence Epic has its own list).
  const epics = azure.items.filter((item) => item.workItemType === 'Epic' && item.id !== absenceEpicId && item.state.trim().toLowerCase() === 'active').sort((a, b) => a.title.localeCompare(b.title))
  const features = stream ? azure.items.filter((item) => item.workItemType === 'Feature' && ['active', 'new'].includes(item.state.trim().toLowerCase()) && epicOf(item)?.id === Number(stream)).sort((a, b) => Number(isMine(b, my.me)) - Number(isMine(a, my.me)) || a.title.localeCompare(b.title)) : []
  const chosenFeature = features.find((item) => item.id === Number(featureId))
  // My month Task already under the chosen Feature: its hours are shown and what is entered replaces them.
  const existingTask = chosenFeature ? mine.find((task) => featureOf(task)?.id === chosenFeature.id) : undefined
  const newValue = (field: keyof Hours) => newHours[field] ?? (existingTask ? hoursText(field === 'planned' ? existingTask.originalEstimate : existingTask.completedWork) : '')

  const checkHours = (entries: Hours[]) => {
    for (const entry of entries) {
      if (!validHours(entry.planned ?? '') || !validHours(entry.actual ?? '')) return 'Hours must be numbers from 0 to 1,000.'
      if (planLocked && entry.planned?.trim()) return `Planning for ${label} is locked: only actual hours can be entered.`
      if (actualLocked && entry.actual?.trim()) return `Actuals for ${label} are locked.`
    }
    return ''
  }
  const effortOf = (entry: Hours) => ({ plan: entry.planned?.trim() ? Number(entry.planned) : undefined, actual: entry.actual?.trim() ? Number(entry.actual) : undefined })

  function saveAll() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    const problem = checkHours([...changedExisting.map((row) => ({ planned: hours[row.key]?.planned !== hoursText(row.task!.originalEstimate) ? hours[row.key]?.planned : undefined, actual: hours[row.key]?.actual !== hoursText(row.task!.completedWork) ? hours[row.key]?.actual : undefined })), ...chosenNew.map((row) => hours[row.key] ?? {})])
    if (problem) { setMessage({ tone: 'error', text: problem }); return }
    const config = azure.config!, pat = azure.pat
    const edits = hours, chosen = chosenNew, changed = changedExisting
    const started = runInBackground('activities:save', `Save ${chosen.length + changed.length} activit${chosen.length + changed.length === 1 ? 'y' : 'ies'} for ${label}`, async (progress) => {
      const failed: string[] = []
      let created = 0, saved = 0
      for (const [index, row] of chosen.entries()) {
        progress(`Adding ${index + 1} of ${chosen.length}…`)
        try {
          const candidate = row.candidate!
          const result = candidate.story ? await ensureStoryMonthTask(config, pat, candidate.story.id, assignee, label, undefined, planLocked)
            : candidate.leave && candidate.kind ? await ensureAbsenceStoryMonthTask(config, pat, candidate.feature.id, candidate.kind, candidate.storyTitle, absenceStoryType, assignee, label, undefined, planLocked)
            : await ensureMonthTask(config, pat, candidate.feature.id, assignee, label, undefined, planLocked)
          const effort = effortOf(edits[row.key] ?? {})
          if (effort.plan != null || effort.actual != null) await updateAzureTimeWritingEffort(config, pat, result.task.id, effort.plan, effort.actual)
          created += 1
        } catch (failure) { failed.push(`${row.title}: ${failure instanceof Error ? failure.message : 'failed'}`) }
      }
      for (const [index, row] of changed.entries()) {
        progress(`Saving hours ${index + 1} of ${changed.length}…`)
        const task = row.task!, edit = edits[row.key] ?? {}
        const plan = edit.planned != null && edit.planned !== hoursText(task.originalEstimate) ? Number(edit.planned) : undefined
        const actual = edit.actual != null && edit.actual !== hoursText(task.completedWork) ? Number(edit.actual) : undefined
        try { await azure.saveTimeWritingEffort(task.id, plan, actual, planLocked && !adhocTask(task) && task.originalEstimate == null && actual != null); saved += 1 }
        catch (failure) { failed.push(`#${task.id}: ${failure instanceof Error ? failure.message : 'failed'}`) }
      }
      setHours({}); setTicked({})
      progress('Refreshing your work…')
      await azure.refresh()
      const text = `${created} activit${created === 1 ? 'y' : 'ies'} added, ${saved} updated for ${label}.${failed.length ? ` ${failed.length} failed — ${failed.join(' · ')}` : ''}`
      setMessage({ tone: failed.length ? 'error' : 'success', text })
      return { text, failed: failed.length > 0 }
    })
    if (!started) setMessage({ tone: 'info', text: 'Your activities are already being saved (see the top bar).' })
  }

  function saveStory() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    if (!chosenFeature) return
    const title = story.title.trim()
    if (!title || title.length > 255) { setMessage({ tone: 'error', text: 'Enter a User Story title of 1–255 characters.' }); return }
    const config = azure.config!, pat = azure.pat, feature = chosenFeature, entry = { title, description: story.description.trim(), comment: story.comment.trim() }
    const started = runInBackground('activities:save', `New User Story “${title}”`, async (progress) => {
      try {
        // The story goes into the current Sprint of the team (else the Feature's iteration), assigned to the person.
        progress('Reading the current Sprint…')
        const sprint = currentIterationPairs(await readAzureIterations(config, pat))[0]?.sprint.path || feature.iterationPath || config.project
        progress('Creating the User Story…')
        const created = await createUserStory(config, pat, { parentId: feature.id, title: entry.title, description: entry.description, acceptanceCriteria: '', iterationPath: sprint, assignedTo: assignee })
        let note = ''
        if (entry.comment) { try { progress('Adding the comment…'); await addComment(config, pat, created.id, entry.comment) } catch (failure) { note = ` The comment could not be added: ${failure instanceof Error ? failure.message : 'failed'}` } }
        setStory({ title: '', description: '', comment: '' })
        await azure.refresh()
        const text = `User Story #${created.id} “${created.title}” added under ${feature.title}${entry.comment && !note ? ', with your comment' : ''}.${note}`
        setMessage({ tone: note ? 'error' : 'success', text })
        return { text, failed: Boolean(note) }
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'The User Story could not be added.'
        setMessage({ tone: 'error', text })
        return { text, failed: true }
      }
    })
    if (!started) setMessage({ tone: 'info', text: 'Your activities are already being saved (see the top bar).' })
  }

  function saveNew() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    if (!chosenFeature) return
    // Only what differs from the existing task is sent (an unchanged planned value is not a change after the plan lock).
    const changedOnly = (field: keyof Hours) => { const value = newValue(field); return existingTask && value === hoursText(field === 'planned' ? existingTask.originalEstimate : existingTask.completedWork) ? undefined : value }
    const entryToSave: Hours = { planned: changedOnly('planned'), actual: changedOnly('actual') }
    const problem = checkHours([entryToSave])
    if (problem) { setMessage({ tone: 'error', text: problem }); return }
    const config = azure.config!, pat = azure.pat, feature = chosenFeature, entry = entryToSave
    const started = runInBackground('activities:save', `Add ${feature.title} for ${label}`, async (progress) => {
      try {
        progress('Adding the month task…')
        const result = await ensureMonthTask(config, pat, feature.id, assignee, label, undefined, planLocked)
        const effort = effortOf(entry)
        if (effort.plan != null || effort.actual != null) await updateAzureTimeWritingEffort(config, pat, result.task.id, effort.plan, effort.actual)
        setNewHours({}); setFeatureId('')
        await azure.refresh()
        const text = result.status === 'exists' ? `${feature.title} already had its ${label} task; its hours were updated.` : `${feature.title} added for ${label}.`
        setMessage({ tone: 'success', text })
        return { text }
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'The activity could not be added.'
        setMessage({ tone: 'error', text })
        return { text, failed: true }
      }
    })
    if (!started) setMessage({ tone: 'info', text: 'Your activities are already being saved (see the top bar).' })
  }

  if (!azure.items.length) return <Page><EmptyState title="No work items yet" detail="Fetch your Time Writing data from Azure DevOps (Settings → Azure DevOps), or load the synthetic sample, to see your activities." /></Page>

  const kindPill = (kind: Row['kind']) => kind === 'work' ? null : <span className={`act-kind act-${kind}`}>{kind === 'training' ? 'Training' : 'Leave'}</span>
  const hourInput = (row: Row, field: keyof Hours, disabled: boolean) => <input className="act-hours" aria-label={`${field === 'planned' ? 'Planned' : 'Actual'} hours for ${row.title}`} inputMode="decimal" placeholder="0" disabled={disabled || saving} value={valueOf(row, field)} onChange={(event) => setValue(row, field, event.target.value)} />
  const leaveRows = toAdd.filter((row) => row.kind !== 'work')
  // The Azure DevOps ID, opening the item in a new tab.
  const idLink = (item?: AzureWorkItem) => item && item.id > 0 ? <a className="act-id" href={item.url} target="_blank" rel="noreferrer" title={`Open #${item.id} in Azure DevOps`}>#{item.id}</a> : null
  const chosenEpic = epics.find((epic) => epic.id === Number(stream))

  return <Page className="activities-page">
    <header className="act-header">
      <div><h2>Add activities</h2><p>Record your activities for {label}. Copy your recurring activities or add a new one.</p></div>
      {!my.me.email && <label className="act-person">Activities of<PersonPicker label="Activities of" value={my.chosenName} people={my.people} onChange={my.setName} meLabel="Choose a person…" /></label>}
    </header>
    {message && <div className={`act-message act-${message.tone}`} role="status">{message.text}<button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setMessage(null)}>×</button></div>}
    {!my.known ? <EmptyState title="Who are you in Azure DevOps?" detail="Set your work email in Settings → Azure DevOps, or choose your name above, to see your activities." /> :
    <div className="act-grid">
      <section className="act-card" aria-labelledby="act-copy">
        <h3 id="act-copy">Your activities for {label}</h3>
        <p className="act-sub">Ticked activities without a task yet are added for {label}; enter or change your hours and save once.</p>
        <table className="act-table">
          <thead><tr><th aria-label="Add" /><th>Activity</th><th className="act-stream">Epic</th><th>Planned</th><th>Actual</th></tr></thead>
          <tbody>
            {existing.map((row) => <tr key={row.key}>
              <td><span className="act-done" title="Already added for this month" aria-label="Added">✓</span></td>
              <td><strong>{idLink(row.link)}{row.title}</strong>{kindPill(row.kind)}<small><span className="act-stream-inline">{row.stream} · </span>Added{adhocTask(row.task!) ? ' · ad-hoc' : ''}</small></td>
              <td className="act-stream">{row.stream}</td>
              <td>{hourInput(row, 'planned', planLocked || adhocTask(row.task!))}</td>
              <td>{hourInput(row, 'actual', actualLocked)}</td>
            </tr>)}
            {toAdd.filter((row) => row.kind === 'work').map((row) => <tr key={row.key} className={isTicked(row) ? '' : 'act-off'}>
              <td><input type="checkbox" aria-label={`Add ${row.title}`} checked={isTicked(row)} disabled={saving} onChange={(event) => setTicked((current) => ({ ...current, [row.key]: event.target.checked }))} /></td>
              <td><strong>{idLink(row.link)}{row.title}</strong><small><span className="act-stream-inline">{row.stream} · </span>{row.candidate!.status === 'needs-story' ? 'New story and task' : 'New task'}{row.candidate!.shared ? ` · shared with ${row.candidate!.shared.owner}` : ''}</small></td>
              <td className="act-stream">{row.stream}</td>
              <td>{hourInput(row, 'planned', planLocked || !isTicked(row))}</td>
              <td>{hourInput(row, 'actual', actualLocked || !isTicked(row))}</td>
            </tr>)}
          </tbody>
        </table>
        {!existing.length && !toAdd.some((row) => row.kind === 'work') && <p className="act-sub">No open Features for you this month. Add an activity on the right.</p>}
        {conflicts.length > 0 && <p className="act-sub">{conflicts.length} Feature{conflicts.length === 1 ? ' has' : 's have'} more than one possible story: <button type="button" className="act-link" onClick={() => onOpen('bulk')}>choose in Bulk actions</button>.</p>}
        {leaveRows.length > 0 && <details className="act-leave">
          <summary>Leave and training <small>— tick only what you take in {label}</small></summary>
          <table className="act-table"><tbody>
            {leaveRows.map((row) => <tr key={row.key} className={isTicked(row) ? '' : 'act-off'}>
              <td><input type="checkbox" aria-label={`Add ${row.title}`} checked={isTicked(row)} disabled={saving} onChange={(event) => setTicked((current) => ({ ...current, [row.key]: event.target.checked }))} /></td>
              <td><strong>{idLink(row.link)}{row.title}</strong>{kindPill(row.kind)}<small>{row.candidate!.story ? 'New task' : 'New story and task'}</small></td>
              <td>{hourInput(row, 'planned', planLocked || !isTicked(row))}</td>
              <td>{hourInput(row, 'actual', actualLocked || !isTicked(row))}</td>
            </tr>)}
          </tbody></table>
        </details>}
        <button type="button" className="act-primary" disabled={!pendingCount || saving} onClick={saveAll}>{saving ? 'Saving…' : pendingCount ? `Save ${pendingCount} activit${pendingCount === 1 ? 'y' : 'ies'}` : 'Nothing to save'}</button>
      </section>

      <div className="act-side">
        <aside className="act-card act-summary" aria-labelledby="act-progress">
          <h3 id="act-progress">Your monthly update</h3>
          <p className="act-sub">Track your progress for {label}.</p>
          <div className="act-ring-row">
            <div className="act-ring" style={{ ['--pct' as string]: `${percent}` }} role="img" aria-label={`${percent}% of activities updated`}><span>{percent}%</span></div>
            <div>
              <strong className="act-count">{updated} of {tracked.length}</strong><span className="act-sub">activities updated</span>
              <ul className="act-legend"><li><i className="dot-done" />{updated} completed</li><li><i className="dot-open" />{Math.max(tracked.length - updated, 0)} remaining</li></ul>
            </div>
          </div>
          <div className={`act-deadline${daysLeft <= 3 ? ' act-urgent' : ''}`}>
            <span aria-hidden="true">⏱</span>
            <div><strong>{planLocked ? 'Actuals' : 'Plan'}: last day {formatDate(deadline)}</strong><small>{daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? 'Last day tomorrow' : daysLeft === 0 ? 'Today is the last day' : 'Locked'}{!planLocked ? ` · actuals until ${formatDate(actualsDay)}` : ''}</small></div>
          </div>
          {toAdd.some((row) => row.kind === 'work' && !isTicked(row)) && <div className="act-block">
            <h4>Suggested missing items</h4>
            {toAdd.filter((row) => row.kind === 'work' && !isTicked(row)).slice(0, 3).map((row) => <div className="act-suggest" key={row.key}><div><strong>{row.title}</strong><small>No {label} task yet</small></div><button type="button" className="act-ghost" onClick={() => setTicked((current) => ({ ...current, [row.key]: true }))}>Add</button></div>)}
          </div>}
        </aside>

        <section className="act-card" aria-labelledby="act-new">
          <h3 id="act-new">Add a new activity</h3>
          <div className="segmented" role="radiogroup" aria-label="What to add">
            <label className={addKind === 'task' ? 'active' : undefined}><input type="radio" name="act-add-kind" checked={addKind === 'task'} onChange={() => setAddKind('task')} />Time Writing task</label>
            <label className={addKind === 'story' ? 'active' : undefined}><input type="radio" name="act-add-kind" checked={addKind === 'story'} onChange={() => setAddKind('story')} />User Story</label>
          </div>
          <p className="act-sub">{addKind === 'task' ? <>Adds your {label} Time Writing task under a Feature — in your Time Writing user story there, which is created when you have none — so you can book hours on it.</> : <>Adds a User Story under a Feature, assigned to you, in the team's current Sprint — with a description and, if you write one, a first comment in its Discussion.</>}</p>
          <div className="act-form">
            <label>Epic<select value={stream} onChange={(event) => { setStream(event.target.value); setFeatureId('') }}><option value="">Select an Epic</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>#{epic.id} {epic.title}</option>)}</select>{chosenEpic && <span className="act-open">{idLink(chosenEpic)} {chosenEpic.title} ↗</span>}</label>
            <label>Feature<select value={featureId} disabled={!stream} onChange={(event) => setFeatureId(event.target.value)}><option value="">{stream ? features.length ? 'Select a Feature' : 'No Active or New Features under this Epic' : 'Select an Epic first'}</option>{features.map((feature) => <option key={feature.id} value={feature.id}>#{feature.id} {feature.title}{isMine(feature, my.me) ? ' (yours)' : ''}</option>)}</select>{chosenFeature && <span className="act-open">{idLink(chosenFeature)} {chosenFeature.title} ↗</span>}</label>
            {addKind === 'story' ? <>
              <label>Title<input value={story.title} maxLength={255} placeholder="What the story is about" onChange={(event) => setStory((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Description<textarea value={story.description} rows={4} placeholder="What needs to be done, and why" onChange={(event) => setStory((current) => ({ ...current, description: event.target.value }))} /></label>
              <label>Comment <small className="muted">(optional, added to its Discussion)</small><textarea value={story.comment} rows={3} onChange={(event) => setStory((current) => ({ ...current, comment: event.target.value }))} /></label>
              <button type="button" className="act-primary" disabled={!chosenFeature || !story.title.trim() || saving} onClick={saveStory}>Add User Story</button>
            </> : <>
            <label>Reporting period<input value={label} readOnly /></label>
            <div className="act-pair">
              <label>Planned hours<input inputMode="decimal" placeholder="0" disabled={planLocked} value={newValue('planned')} onChange={(event) => setNewHours((current) => ({ ...current, planned: event.target.value }))} /></label>
              <label>Actual hours<input inputMode="decimal" placeholder="0" disabled={actualLocked} value={newValue('actual')} onChange={(event) => setNewHours((current) => ({ ...current, actual: event.target.value }))} /></label>
            </div>
            {existingTask && <p className="act-hint">You already have this task for {label} (#{existingTask.id}). Its hours are shown above; what you save replaces them — nothing is added up, and no second task is created.</p>}
            {planLocked && <p className="act-hint">Planning for {label} is locked: a new task is tagged ad-hoc and takes actual hours only.</p>}
            <button type="button" className="act-primary" disabled={!chosenFeature || saving} onClick={saveNew}>Save activity</button>
            </>}
            <p className="act-sub">Feature not listed? <button type="button" className="act-link" onClick={() => onOpen('mywork')}>Create a new Feature</button></p>
          </div>
        </section>
      </div>
    </div>}
  </Page>
}
