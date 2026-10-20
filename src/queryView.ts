import type { AzureWorkItem } from './domain'

// Read-only views of a connection's query results: the columns are the query's own SELECT list, in its order, named
// as Azure DevOps names them; rows follow the query's ORDER BY. A query that selects only the ID (or a team backlog
// without a query) shows the default columns.
export interface QueryColumn { ref: string; name: string }
export interface QueryOrder { ref: string; desc: boolean }
export const defaultViewColumns = ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.AssignedTo', 'System.IterationPath']

// Field references in a SELECT or ORDER BY list, with or without square brackets: "[System.Id], System.Title".
const fieldRef = /^\[?\s*([A-Za-z_][\w]*(?:\.[\w]+)*)\s*\]?$/
const splitList = (text: string) => text.split(',').map((part) => part.trim()).filter(Boolean)
const refOf = (part: string) => fieldRef.exec(part.replace(/\s+(ASC|DESC)$/i, '').trim())?.[1]

export function queryLayout(wiql?: string): { columns: string[]; orderBy: QueryOrder[] } {
  const text = (wiql ?? '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim()
  const select = /^SELECT\s+(.+?)\s+FROM\s+WorkItems\b/i.exec(text)?.[1] ?? ''
  const selected = [...new Set(splitList(select).map(refOf).filter((ref): ref is string => Boolean(ref)))]
  const columns = selected.length > 1 || (selected.length === 1 && selected[0] !== 'System.Id') ? selected : defaultViewColumns
  const order = /\sORDER\s+BY\s+(.+)$/i.exec(text)?.[1] ?? ''
  const orderBy = splitList(order).flatMap((part) => { const ref = refOf(part); return ref ? [{ ref, desc: /\bDESC$/i.test(part) }] : [] })
  return { columns, orderBy }
}

// Field values kept for the view: identities become their display name, other values stay as Azure sends them.
export type FieldValue = string | number | boolean | null
export function pickFields(fields: Record<string, unknown>, refs: string[]): Record<string, FieldValue> {
  const picked: Record<string, FieldValue> = {}
  for (const ref of refs) {
    const value = fields[ref]
    if (value == null) continue
    if (typeof value === 'object') { const named = value as { displayName?: unknown; uniqueName?: unknown }; picked[ref] = typeof named.displayName === 'string' ? named.displayName : typeof named.uniqueName === 'string' ? named.uniqueName : JSON.stringify(value) }
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') picked[ref] = value
  }
  return picked
}

// Standard fields come from the mapped work item, so cached items and team backlogs fill the default columns too.
const standard: Record<string, (item: AzureWorkItem) => FieldValue | undefined> = {
  'System.Id': (item) => item.id, 'System.Title': (item) => item.title, 'System.WorkItemType': (item) => item.workItemType,
  'System.State': (item) => item.state, 'System.AssignedTo': (item) => item.assignedTo, 'System.AreaPath': (item) => item.areaPath,
  'System.IterationPath': (item) => item.iterationPath, 'System.Tags': (item) => item.tags, 'System.ChangedDate': (item) => item.changedDate,
  'System.CreatedDate': (item) => item.createdDate, 'Microsoft.VSTS.Scheduling.TargetDate': (item) => item.targetDate, 'Microsoft.VSTS.Common.ClosedDate': (item) => item.closedDate,
}
export function cellValue(item: AzureWorkItem, ref: string): FieldValue | undefined {
  return item.fields?.[ref] ?? standard[ref]?.(item)
}

const builtInNames: Record<string, string> = { 'System.Id': 'ID', 'System.WorkItemType': 'Work Item Type', 'System.AssignedTo': 'Assigned To', 'System.IterationPath': 'Iteration Path', 'System.AreaPath': 'Area Path', 'System.TeamProject': 'Team Project' }
// Column heading: Azure's field name when it was read, else a readable form of the reference name.
export function columnName(ref: string, names: Record<string, string> = {}) {
  return names[ref] ?? builtInNames[ref] ?? ref.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
}

const isDate = (value: FieldValue | undefined): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
export function formatCell(value: FieldValue | undefined) {
  if (value == null || value === '') return ''
  if (isDate(value)) return value.slice(0, 10)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

const compare = (a: FieldValue | undefined, b: FieldValue | undefined) => {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1
  if (b == null || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}
export function sortItems(items: AzureWorkItem[], order: QueryOrder[]) {
  if (!order.length) return items
  return [...items].sort((a, b) => { for (const { ref, desc } of order) { const result = compare(cellValue(a, ref), cellValue(b, ref)); if (result) return desc ? -result : result } return 0 })
}

// Summary strip: counts by State, Work Item Type and Assigned To; overdue = open with a passed target date;
// changed in the last 7 days.
const closedStates = new Set(['closed', 'done', 'completed', 'resolved', 'removed', 'cut', 'approved'])
export function viewSummary(items: AzureWorkItem[], today: string) {
  const count = (key: (item: AzureWorkItem) => string) => [...items.reduce((map, item) => map.set(key(item) || '—', (map.get(key(item) || '—') ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10)
  return {
    total: items.length,
    byState: count((item) => item.state), byType: count((item) => item.workItemType), byPerson: count((item) => item.assignedTo || 'Unassigned'),
    overdue: items.filter((item) => item.targetDate && item.targetDate.slice(0, 10) < today && !closedStates.has(item.state.trim().toLowerCase())).length,
    changedThisWeek: items.filter((item) => item.changedDate && item.changedDate.slice(0, 10) >= weekAgo).length,
  }
}

const csvCell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
export function viewCsv(items: AzureWorkItem[], columns: QueryColumn[]) {
  return [columns.map((column) => csvCell(column.name)).join(','), ...items.map((item) => columns.map((column) => csvCell(formatCell(cellValue(item, column.ref)))).join(','))].join('\r\n')
}
