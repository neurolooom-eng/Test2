import { useState } from 'react'
import { Metric, Metrics, Page, Panel, Pill, TablePanel } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights, timeWritingGaps } from '../azureInsights'
import { formatHours, monthName, todayIso } from '../format'
import type { PageProps } from './types'

type Edit = { originalEstimate?: string; completedWork?: string }
const nextMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7) }
const locked = (deadline: string | undefined, explicit: boolean | undefined, extension: string | undefined, now: Date) => Boolean(explicit || (deadline && now >= new Date(extension || deadline)))
const adhoc = (tags: string) => tags.split(';').some(tag => tag.trim().toLowerCase() === 'ad-hoc')

export function MonthlyPage({ azure, month, store, onOpenConnection }: { azure: AzureWorkspace; month: string; store: PageProps['store']; onOpenConnection: () => void }) {
  const [today] = useState(todayIso)
  const [now] = useState(() => new Date())
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [saving, setSaving] = useState(false)
  const data = azureInsights(azure.items, month, today)
  const gaps = timeWritingGaps(azure.items, month)
  const planningPeriod = store.state.periods.find(item => item.month === month)
  const actualPeriod = store.state.periods.find(item => item.month === nextMonth(month))
  const planningLocked = locked(planningPeriod?.planningDeadline ?? `${month}-05T23:59:59`, planningPeriod?.planningLocked, planningPeriod?.planningExtendedUntil, now)
  const actualsLocked = locked(actualPeriod?.actualsDeadline ?? `${nextMonth(month)}-05T23:59:59`, actualPeriod?.actualsLocked, actualPeriod?.actualsExtendedUntil, now)
  const staged = Object.keys(edits).length
  const change = (id: number, field: keyof Edit, fieldValue: string) => setEdits(current => ({ ...current, [id]: { ...current[id], [field]: fieldValue } }))
  const editValue = (task: typeof data.monthlyTasks[number], field: keyof Edit) => edits[task.id]?.[field] ?? (field === 'originalEstimate' ? task.originalEstimate == null ? '' : String(task.originalEstimate) : task.completedWork == null ? '' : String(task.completedWork))
  const saveAll = async () => {
    const changed = data.monthlyTasks.filter(task => edits[task.id] && Object.values(edits[task.id]).some(item => item !== undefined))
    if (!changed.length) return
    for (const task of changed) {
      const edit = edits[task.id], isAdhoc = adhoc(task.tags)
      const planChanged = edit.originalEstimate != null && edit.originalEstimate !== (task.originalEstimate == null ? '' : String(task.originalEstimate))
      const actualChanged = edit.completedWork != null && edit.completedWork !== (task.completedWork == null ? '' : String(task.completedWork))
      if ((planChanged && (planningLocked || isAdhoc)) || (actualChanged && actualsLocked)) { azure.setError('A staged change is in a locked field. Unlock the period in Administration before saving.'); return }
      for (const item of [planChanged ? edit.originalEstimate : undefined, actualChanged ? edit.completedWork : undefined]) if (item != null && (!item.trim() || !Number.isFinite(Number(item)) || Number(item) < 0)) { azure.setError('Original Estimate and Completed Work must be non-negative numbers.'); return }
    }
    setSaving(true)
    try {
      for (const task of changed) {
        const edit = edits[task.id], isAdhoc = adhoc(task.tags)
        const planChanged = edit.originalEstimate != null && edit.originalEstimate !== (task.originalEstimate == null ? '' : String(task.originalEstimate))
        const actualChanged = edit.completedWork != null && edit.completedWork !== (task.completedWork == null ? '' : String(task.completedWork))
        await azure.saveTimeWritingEffort(task.id, planChanged ? Number(edit.originalEstimate) : undefined, actualChanged ? Number(edit.completedWork) : undefined, planningLocked && !isAdhoc && task.originalEstimate == null && actualChanged)
      }
      setEdits({})
    } catch (failure) { azure.setError(failure instanceof Error ? failure.message : 'Unable to save staged Azure fields.') } finally { setSaving(false) }
  }
  return <Page>
    <AzureSourceBar azure={azure} onOpenConnection={onOpenConnection} />
    <Metrics>
      <Metric label="Tasks" value={data.monthlyTasks.length} hint="Matched to the selected month" />
      <Metric label="Original Estimate" value={formatHours(data.plan.value)} hint="Azure DevOps Task field" />
      <Metric label="Completed Work" value={formatHours(data.actual.value)} hint="Azure DevOps Task field" />
      <Metric label="Staged changes" value={staged} hint="Saved in one Azure operation" />
    </Metrics>
    <TablePanel title="Time Writing Tasks" detail={<>Planning locks after its configured deadline (default: 5th). Actuals for this month lock on the next month’s configured deadline (default: 5th). Administration can lock, unlock or extend them separately. A Task first receiving Completed Work after planning has locked is tagged <code>ad-hoc</code>.</>} action={<><Pill tone={planningLocked ? 'locked' : 'open'}>Planning {planningLocked ? 'locked' : 'open'}</Pill><Pill tone={actualsLocked ? 'locked' : 'open'}>Actuals {actualsLocked ? 'locked' : 'open'}</Pill><button className="primary" disabled={saving || !staged || !azure.pat.trim()} onClick={() => void saveAll()}>{saving ? 'Saving staged changes…' : `Save ${staged} staged task(s) to Azure`}</button><button className="ghost" disabled={saving || !staged} onClick={() => setEdits({})}>Discard staged changes</button></>} empty={data.monthlyTasks.length ? undefined : `No Time Writing Tasks have a title for ${month}.`}>
      <table><thead><tr><th>Epic</th><th>Time Writing User Story</th><th>Month Task</th><th>State</th><th>Original Estimate</th><th>Completed Work</th><th>Tags</th></tr></thead><tbody>{data.epicBreakdown.flatMap(group => data.monthlyTasks.filter(task => group.stories.some(story => story.id === task.parentId)).map(task => { const story = group.stories.find(item => item.id === task.parentId), isAdhoc = adhoc(task.tags); return <tr key={task.key}><td>{group.epic ? <a href={group.epic.url} target="_blank" rel="noreferrer">#{group.epic.id} {group.epic.title}</a> : 'No Epic path'}</td><td>{story ? <a href={story.url} target="_blank" rel="noreferrer">#{story.id} {story.title}</a> : 'No parent story'}</td><td><a href={task.url} target="_blank" rel="noreferrer">#{task.id} {task.title}</a></td><td><Pill tone="info">{task.state}</Pill></td><td><input aria-label={`Original Estimate for ${task.id}`} disabled={planningLocked || isAdhoc || saving} inputMode="decimal" value={editValue(task, 'originalEstimate')} onChange={event => change(task.id, 'originalEstimate', event.target.value)} /></td><td><input aria-label={`Completed Work for ${task.id}`} disabled={actualsLocked || saving} inputMode="decimal" value={editValue(task, 'completedWork')} onChange={event => change(task.id, 'completedWork', event.target.value)} /></td><td>{isAdhoc ? <Pill tone="warning">ad-hoc</Pill> : task.tags || '—'}</td></tr> }))}</tbody></table>
      {!azure.pat.trim() && data.monthlyTasks.length > 0 && <p className="muted">Select an ADS configuration whose PAT has Work Items (Read &amp; Write) to save staged Azure fields.</p>}
    </TablePanel>
    <GapsPanel gaps={gaps} month={month} />
  </Page>
}

// Lists what the page did not pick up for the month and why, so naming or hierarchy problems are visible.
function GapsPanel({ gaps, month }: { gaps: ReturnType<typeof timeWritingGaps>; month: string }) {
  const label = monthName(month)
  const total = gaps.storiesWithoutTask.length + gaps.tasksWithoutMonth.length + gaps.tasksOutsideStory.length
  const link = (item: { id: number; title: string; url: string }) => <a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a>
  return <Panel className="admin-section gaps-panel" eyebrow="CHECK" title={total ? `Not picked up for ${label} (${total})` : `Everything picked up for ${label}`}
    detail={<>A Task is counted when its title starts with the month (e.g. “{label} | …”, also “{label.slice(0, 3)} {month.slice(0, 4)} - …”) and it sits directly under a User Story whose title contains “Time Writing”. Only items in the saved backlog are checked — the team’s Epic backlog and area paths, or a Time Writing connection’s query — so refresh from Azure and save the preview after adding items.</>}>
    {gaps.storiesWithoutTask.length > 0 && <details open><summary><Pill tone="warning">{gaps.storiesWithoutTask.length}</Pill> Time Writing stories with no “{label} | …” Task</summary><p className="muted">Add the month Task under each story (My work can create them for your Features).</p><ul>{gaps.storiesWithoutTask.slice(0, 60).map((story) => <li key={story.key}>{link(story)}{story.assignedTo && <small> · {story.assignedTo}</small>}</li>)}</ul></details>}
    {gaps.tasksWithoutMonth.length > 0 && <details open><summary><Pill tone="warning">{gaps.tasksWithoutMonth.length}</Pill> Tasks under a Time Writing story without a month in the title</summary><p className="muted">Start the title with the month, e.g. “{label} | …”.</p><ul>{gaps.tasksWithoutMonth.slice(0, 60).map((task) => <li key={task.key}>{link(task)}</li>)}</ul></details>}
    {gaps.tasksOutsideStory.length > 0 && <details open><summary><Pill tone="warning">{gaps.tasksOutsideStory.length}</Pill> “{label}” Tasks not under a Time Writing story</summary><p className="muted">Move them under the “… - Time Writing” story, or add “Time Writing” to the parent story’s title.</p><ul>{gaps.tasksOutsideStory.slice(0, 60).map(({ task, parent }) => <li key={task.key}>{link(task)}<small> · parent: {parent ? `#${parent.id} ${parent.title} (${parent.workItemType})` : task.parentId ? `#${task.parentId} (not in the saved data)` : 'none'}</small></li>)}</ul></details>}
  </Panel>
}
