import type { AzureWorkItem } from './domain'
import { addMonthTasks, currentIndiaMonth, ensureMonthTask, type AzureConfig, type AzureTransport } from './azureDevOps.ts'
import { setupHours, type FeatureSetups } from './featureSetup.ts'
import { adhocAfterLock } from './planningLock.ts'
import { featureOf } from './myWork.ts'

// "＋ Time Writing Task" on a Feature or User Story row (BKL-22): this month's Task for the person, under the Feature
// (the row's own Feature, or the one above the Story), placed by the usual rules (planMonthStory: an existing Task of
// theirs is reused, their own Time Writing story first) — the same as Bulk actions, one Feature at a time. Leave and
// training under the Team Holidays and Training Epic work the same way. After the planning lock the new Task is ad-hoc.
// BKL-28: for the month selected in the header; a new Task gets the Epic setup's default hours.
export async function addMonthTask(config: AzureConfig, pat: string, items: AzureWorkItem[], item: AzureWorkItem, assignee: string, month = currentIndiaMonth(), setups?: FeatureSetups | null) {
  const feature = featureOf(items, item)
  if (!feature) throw new Error(`#${item.id} has no Feature above it to hold a Time Writing Task.`)
  const byId = new Map(items.map((entry) => [entry.id, entry]))
  let epic: AzureWorkItem | undefined = feature
  for (let guard = 0; epic && epic.workItemType !== 'Epic' && guard < 6; guard += 1) epic = epic.parentId == null ? undefined : byId.get(epic.parentId)
  const result = await ensureMonthTask(config, pat, feature.id, assignee, month, undefined, adhocAfterLock(month), setupHours(setups, epic?.id))
  const text = result.status === 'created' ? `${month} Time Writing Task created under ${result.storyCreated ? 'a new' : 'the'} story “${result.story.title}”.` : `Your ${month} Time Writing Task under “${feature.title}” already exists.`
  return { result, feature, text, changed: [result.task, ...(result.storyCreated ? [result.story] : [])] }
}

// BKL-34: "＋ Time Writing Task" for several months at once, each with its own hours (Original Estimate; Completed Work
// for a month not in the future), by the one Task rule (addMonthTasks → ensureMonthTask): an existing Task of the person
// is reused and gets the hours typed for it; a new one gets them, else the Epic setup's default; ad-hoc after the lock.
export interface MonthEntry { month: string; originalEstimate?: number; completedWork?: number }
export async function addMonthTasksFor(config: AzureConfig, pat: string, items: AzureWorkItem[], item: AzureWorkItem, assignee: string, entries: MonthEntry[], setups?: FeatureSetups | null, progress?: (text: string) => void, transport?: AzureTransport) {
  const feature = featureOf(items, item)
  if (!feature) throw new Error(`#${item.id} has no Feature above it to hold a Time Writing Task.`)
  if (!entries.length) throw new Error('Choose at least one month.')
  const byId = new Map(items.map((entry) => [entry.id, entry]))
  let epic: AzureWorkItem | undefined = feature
  for (let guard = 0; epic && epic.workItemType !== 'Epic' && guard < 6; guard += 1) epic = epic.parentId == null ? undefined : byId.get(epic.parentId)
  const changed = await addMonthTasks(config, pat, feature.id, assignee, entries.map((entry) => ({ ...entry, adhoc: adhocAfterLock(entry.month) })), setupHours(setups, epic?.id), transport, progress)
  const months = entries.map((entry) => entry.month)
  const text = `Time Writing Task${months.length === 1 ? '' : 's'} for ${months.join(', ')} under “${feature.title}” ready (an existing one is reused).`
  return { feature, changed, text }
}
