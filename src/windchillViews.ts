// Windchill views (Option A): a name, an object type (an OData entity set such as DocMgmt/Documents), filter rows
// (field, condition, value) and the columns to show. The app turns them into one read-only REST query, run from the
// desktop app. Saved in this browser like the Azure DevOps connections; results are stored with the app data.
export type WindchillOp = 'eq' | 'ne' | 'startswith' | 'contains' | 'gt' | 'ge' | 'lt' | 'le'
export interface WindchillFilter { field: string; op: WindchillOp; value: string }
export interface WindchillView { id: string; name: string; entitySet: string; filters: WindchillFilter[]; columns: string[]; showInMenu: boolean }
export const windchillOps: { op: WindchillOp; label: string }[] = [
  { op: 'eq', label: 'equals' }, { op: 'ne', label: 'is not' }, { op: 'startswith', label: 'starts with' }, { op: 'contains', label: 'contains' },
  { op: 'gt', label: 'after / greater than' }, { op: 'ge', label: 'on or after / at least' }, { op: 'lt', label: 'before / less than' }, { op: 'le', label: 'on or before / at most' },
]
// Domain/Set, with the domain's version in front where the server has one (Windchill REST: v7/DocMgmt/Documents).
const entitySetPattern = /^(v\d+\/)?[A-Za-z][A-Za-z0-9_]*\/[A-Za-z][A-Za-z0-9_]*$/
const fieldPattern = /^[A-Za-z_][A-Za-z0-9_]*(\/[A-Za-z_][A-Za-z0-9_]*)*$/
const storageKey = 'demand-planning-windchill-views-v1'

export function validateWindchillView(view: WindchillView): WindchillView {
  const name = view.name.trim(), entitySet = view.entitySet.trim().replace(/^\/+|\/+$/g, '')
  if (!name) throw new Error('Give the Windchill view a name.')
  if (!entitySetPattern.test(entitySet)) throw new Error('Object type looks like version/Domain/Set, e.g. v7/DocMgmt/Documents (the domain and its version are listed by Test connection).')
  const filters = view.filters.filter((filter) => filter.field.trim() || filter.value.trim()).map((filter) => {
    const field = filter.field.trim()
    if (!fieldPattern.test(field)) throw new Error(`“${field || '(empty)'}” is not a field name, e.g. Number, Name or State/Value.`)
    if (!windchillOps.some((entry) => entry.op === filter.op)) throw new Error(`Unknown condition for ${field}.`)
    if (!filter.value.trim()) throw new Error(`Enter a value for ${field}.`)
    return { field, op: filter.op, value: filter.value.trim() }
  })
  const columns = [...new Set(view.columns.map((column) => column.trim()).filter(Boolean))]
  for (const column of columns) if (!fieldPattern.test(column)) throw new Error(`“${column}” is not a field name.`)
  if (!columns.length) throw new Error('Choose at least one column, e.g. Number, Name, State/Value.')
  return { id: view.id, name, entitySet, filters, columns, showInMenu: view.showInMenu }
}

// Value as an OData literal: a date (YYYY-MM-DD) as the start of that day in UTC, numbers and true/false as they are,
// anything else as a quoted string (quotes doubled).
function literal(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`
  if (/^-?\d+(\.\d+)?$/.test(value) || value === 'true' || value === 'false') return value
  return `'${value.replace(/'/g, "''")}'`
}
const text = (value: string) => `'${value.replace(/'/g, "''")}'`

// The query path below the service root, e.g. DocMgmt/Documents?$filter=startswith(Number,'DHF')&$select=Number,Name.
export function buildWindchillQuery(input: WindchillView) {
  const view = validateWindchillView(input)
  const filter = view.filters.map(({ field, op, value }) => op === 'startswith' || op === 'contains' ? `${op}(${field},${text(value)})` : `${field} ${op} ${literal(value)}`).join(' and ')
  const select = [...new Set(view.columns.map((column) => column.split('/')[0]))].join(',')
  return `${view.entitySet}?${filter ? `$filter=${encodeURIComponent(filter)}&` : ''}$select=${encodeURIComponent(select)}`
}

// A cell: follows a path such as State/Value; objects show their Display or Value.
export function windchillCell(row: Record<string, unknown>, column: string): string {
  let value: unknown = row
  for (const part of column.split('/')) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
  if (value == null) return ''
  if (typeof value === 'object') { const entry = value as Record<string, unknown>; return String(entry.Display ?? entry.Value ?? JSON.stringify(value)) }
  return String(value)
}

const validStored = (value: unknown): value is WindchillView => Boolean(value && typeof value === 'object' && typeof (value as WindchillView).id === 'string' && /^[\w-]{1,80}$/.test((value as WindchillView).id) && typeof (value as WindchillView).name === 'string' && typeof (value as WindchillView).entitySet === 'string' && Array.isArray((value as WindchillView).filters) && Array.isArray((value as WindchillView).columns))
export function loadWindchillViews(storage: Pick<Storage, 'getItem'> = localStorage): WindchillView[] {
  try { const raw = JSON.parse(storage.getItem(storageKey) ?? '[]'); return Array.isArray(raw) ? raw.filter(validStored).map((view) => ({ ...view, showInMenu: view.showInMenu !== false })) : [] } catch { return [] }
}
export function saveWindchillViews(views: WindchillView[], storage: Pick<Storage, 'setItem'> = localStorage) { storage.setItem(storageKey, JSON.stringify(views)) }
export const isWindchillView = validStored
