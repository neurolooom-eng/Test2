import { useMemo, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import type { AzureConfig } from '../azureDevOps'
import { currentIndiaMonth } from '../azureDevOps'
import { timeWritingMonth } from '../azureInsights'
import { setupHours, type FeatureSetups } from '../featureSetup'
import { isFutureMonth, monthKeyOfLabel, monthLabelOfKey } from '../featureMonths'
import { addMonthTasksFor } from '../monthTaskAction'
import { featureOf } from '../myWork'
import { adhocAfterLock } from '../planningLock'
import { Modal, Notice } from './ui'

// BKL-34 "＋ Time Writing Task": the months to add a Time Writing Task for — the month in the header first — each with
// its hours (Original Estimate; Completed Work for a month not in the future), "＋ Add month" for the next one, any month
// changeable; a month the person already has a Task for shows it (its hours are updated only where typed).
type Row = { key: string; plan: string; done: string }
const nextKey = (key: string) => { const [year, month] = key.split('-').map(Number); return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}` }

export function MonthTasksDialog({ item, items, config, pat, me, month, featureSetup, onDone, onClose }: { item: AzureWorkItem; items: AzureWorkItem[]; config: AzureConfig; pat: string; me: string; month?: string; featureSetup?: FeatureSetups | null; onDone: (text: string, changed: AzureWorkItem[]) => void; onClose: () => void }) {
  const todayLabel = currentIndiaMonth()
  const start = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKeyOfLabel(todayLabel) ?? ''
  const [rows, setRows] = useState<Row[]>([{ key: start, plan: '', done: '' }])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const feature = featureOf(items, item)
  // The Epic's default hours for a new Task (its Feature setup), shown as the placeholder.
  const defaultHours = useMemo(() => {
    const byId = new Map(items.map((entry) => [entry.id, entry]))
    let epic: AzureWorkItem | undefined = feature
    for (let guard = 0; epic && epic.workItemType !== 'Epic' && guard < 6; guard += 1) epic = epic.parentId == null ? undefined : byId.get(epic.parentId)
    return setupHours(featureSetup, epic?.id)
  }, [items, feature, featureSetup])
  // My month Tasks already under this Feature (any story), by month.
  const mine = useMemo(() => {
    const byId = new Map(items.map((entry) => [entry.id, entry]))
    const under = (task: AzureWorkItem) => { let at: AzureWorkItem | undefined = task; for (let guard = 0; at && guard < 4; guard += 1) { if (at.id === feature?.id) return true; at = at.parentId == null ? undefined : byId.get(at.parentId) } return false }
    const found = new Map<string, AzureWorkItem>()
    for (const task of items) if (task.workItemType === 'Task' && task.assignedToEmail === me && task.state.toLowerCase() !== 'removed' && under(task)) { const key = timeWritingMonth(task.title); if (key) found.set(key, task) }
    return found
  }, [items, feature, me])
  const keys = rows.map((row) => row.key)
  const duplicate = keys.find((key, index) => key && keys.indexOf(key) !== index)
  const set = (index: number, change: Partial<Row>) => setRows((now) => now.map((row, at) => at === index ? { ...row, ...change } : row))
  const addMonth = () => setRows((now) => { const last = [...now.map((row) => row.key)].filter(Boolean).sort().pop() ?? start; let key = nextKey(last); while (now.some((row) => row.key === key)) key = nextKey(key); return [...now, { key, plan: '', done: '' }] })

  async function save() {
    if (!feature) { setError(`#${item.id} has no Feature above it to hold a Time Writing Task.`); return }
    if (rows.some((row) => !/^\d{4}-\d{2}$/.test(row.key))) { setError('Choose a month for every row.'); return }
    if (duplicate) { setError(`${monthLabelOfKey(duplicate)} is listed twice.`); return }
    const hours = (value: string, what: string) => { if (!value.trim()) return undefined; const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 1000000) throw new Error(`${what} must be a number from 0 to 1,000,000.`); return number }
    let entries
    try { entries = [...rows].sort((a, b) => a.key.localeCompare(b.key)).map((row) => { const label = monthLabelOfKey(row.key); return { month: label, originalEstimate: hours(row.plan, `Original Estimate of ${label}`), completedWork: isFutureMonth(label, todayLabel) ? undefined : hours(row.done, `Completed Work of ${label}`) } }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the hours.'); return }
    setError(''); setBusy('Adding…')
    try { const done = await addMonthTasksFor(config, pat, items, item, me, entries, featureSetup, setBusy); onDone(done.text, done.changed) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The Time Writing Tasks could not be added.'); setBusy('') }
  }

  return <Modal title="Time Writing Tasks" eyebrow="AZURE DEVOPS WRITE" onClose={() => { if (!busy) onClose() }}>
    <div className="month-tasks">
      <p className="muted">Your Time Writing Task per month under “{feature?.title ?? `#${item.id}`}” — “{'{Month}'} | {feature?.title ?? '…'}”. Add the months you need; the hours are optional and can be changed later.</p>
      <table className="nf-month-hours"><thead><tr><th scope="col">Month</th><th scope="col">Original Estimate (h)</th><th scope="col">Completed Work (h)</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>{rows.map((row, index) => { const label = row.key ? monthLabelOfKey(row.key) : '', future = Boolean(label) && isFutureMonth(label, todayLabel), existing = mine.get(row.key); return <tr key={index}>
          <th scope="row"><input type="month" aria-label={`Month ${index + 1}`} value={row.key} disabled={Boolean(busy)} onChange={(event) => set(index, { key: event.target.value })} />
            {existing && <small className="muted month-tasks-note">You have #{existing.id}{existing.originalEstimate != null ? ` (${existing.originalEstimate} h)` : ''}: it is kept</small>}
            {label && adhocAfterLock(label) && !existing && <small className="muted month-tasks-note">Planning is locked: tagged ad-hoc</small>}</th>
          <td><input type="number" aria-label={`Original Estimate (h) ${label || index + 1}`} min="0" max="1000000" step="0.25" value={row.plan} disabled={Boolean(busy)} placeholder={existing?.originalEstimate != null ? String(existing.originalEstimate) : defaultHours != null ? `${defaultHours} (setup)` : 'Optional'} onChange={(event) => set(index, { plan: event.target.value })} /></td>
          <td><input type="number" aria-label={`Completed Work (h) ${label || index + 1}`} min="0" max="1000000" step="0.25" value={future ? '' : row.done} disabled={Boolean(busy) || future} placeholder={future ? '—' : existing?.completedWork != null ? String(existing.completedWork) : 'Optional'} onChange={(event) => set(index, { done: event.target.value })} /></td>
          <td>{rows.length > 1 && <button type="button" className="text-button danger-text" aria-label={`Remove ${label || `month ${index + 1}`}`} disabled={Boolean(busy)} onClick={() => setRows((now) => now.filter((_, at) => at !== index))}>✕</button>}</td>
        </tr> })}</tbody>
      </table>
      <div className="button-row"><button type="button" className="ghost" disabled={Boolean(busy)} onClick={addMonth}>＋ Add month</button></div>
      {duplicate && <Notice tone="warning">{monthLabelOfKey(duplicate)} is listed twice.</Notice>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={Boolean(busy)} onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={Boolean(busy) || Boolean(duplicate)} onClick={() => void save()}>{busy || `Add ${rows.length} month${rows.length === 1 ? '' : 's'}`}</button></div>
    </div>
  </Modal>
}
