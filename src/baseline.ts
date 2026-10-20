import type { AzureWorkItem } from './domain'
import { isTimeWritingStory } from './azureInsights.ts'

// Baseline = estimation rules per stream, applied to each release's scope. A rule combines:
//  - fixed hours by release type (e.g. DP: Major 40h, MLD 30h, PU 20h),
//  - line items priced per unit, where units = base units + driver count × units per driver
//    (e.g. CP documents: 2h × (14 + 11 × assets)),
//  - an optional cap on the total.
// A release's scope (type and driver counts) is kept as a dated history, so a re-baseline after items are
// scoped in is visible as growth rather than overwriting the original estimate.
export interface BaselineItem { label: string; hoursPerUnit: number; baseUnits: number; driver?: string; unitsPerDriver?: number }
export interface BaselineRule { stream: string; types: Record<string, number>; items: BaselineItem[]; cap?: number }
export interface ScopeEntry { at: string; type?: string; drivers: Record<string, number>; reason?: string }
export interface ReleaseScope { release: string; stream: string; history: ScopeEntry[] }

// Illustrative values from the planning conversation; replaced by the exact baseline when it is shared.
export const exampleBaselineRules: BaselineRule[] = [
  { stream: 'DP', types: { Major: 40, Minor: 40, MLD: 30, PU: 20 }, items: [] },
  { stream: 'Serviceability', types: {}, items: [{ label: 'Documents', hoursPerUnit: 2, baseUnits: 0, driver: 'documents', unitsPerDriver: 1 }], cap: 60 },
  { stream: 'CP', types: {}, items: [{ label: 'Documents', hoursPerUnit: 2, baseUnits: 14, driver: 'assets', unitsPerDriver: 11 }] },
]

const finite = (value: unknown, min = 0) => { const number = Number(value); return Number.isFinite(number) && number >= min ? number : undefined }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export function normalizeRules(value: unknown): BaselineRule[] {
  if (!Array.isArray(value)) return exampleBaselineRules
  const seen = new Set<string>()
  return value.flatMap((raw): BaselineRule[] => {
    if (!raw || typeof raw !== 'object') return []
    const input = raw as Record<string, unknown>
    const stream = text(input.stream)
    if (!stream || seen.has(stream.toLowerCase())) return []
    seen.add(stream.toLowerCase())
    const types: Record<string, number> = {}
    if (input.types && typeof input.types === 'object' && !Array.isArray(input.types)) for (const [name, hours] of Object.entries(input.types)) { const value = finite(hours); if (name.trim() && value != null) types[name.trim()] = value }
    const items = (Array.isArray(input.items) ? input.items : []).flatMap((item): BaselineItem[] => {
      if (!item || typeof item !== 'object') return []
      const entry = item as Record<string, unknown>
      const label = text(entry.label), hoursPerUnit = finite(entry.hoursPerUnit)
      if (!label || hoursPerUnit == null) return []
      const driver = text(entry.driver), unitsPerDriver = finite(entry.unitsPerDriver)
      return [{ label, hoursPerUnit, baseUnits: finite(entry.baseUnits) ?? 0, ...(driver && unitsPerDriver != null ? { driver, unitsPerDriver } : {}) }]
    })
    const cap = finite(input.cap)
    return [{ stream, types, items, ...(cap ? { cap } : {}) }]
  })
}

export function normalizeScopes(value: unknown): ReleaseScope[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw): ReleaseScope[] => {
    if (!raw || typeof raw !== 'object') return []
    const input = raw as Record<string, unknown>
    const release = text(input.release), stream = text(input.stream)
    const history = (Array.isArray(input.history) ? input.history : []).flatMap((item): ScopeEntry[] => {
      if (!item || typeof item !== 'object') return []
      const entry = item as Record<string, unknown>
      if (!Number.isFinite(Date.parse(text(entry.at)))) return []
      const drivers: Record<string, number> = {}
      if (entry.drivers && typeof entry.drivers === 'object' && !Array.isArray(entry.drivers)) for (const [name, count] of Object.entries(entry.drivers)) { const value = finite(count); if (name.trim() && value != null) drivers[name.trim()] = value }
      return [{ at: text(entry.at), ...(text(entry.type) ? { type: text(entry.type) } : {}), drivers, ...(text(entry.reason) ? { reason: text(entry.reason) } : {}) }]
    }).sort((a, b) => a.at.localeCompare(b.at))
    return release && stream && history.length ? [{ release, stream, history }] : []
  })
}

// Driver names a rule asks for, in order of first use (e.g. ['assets'] for CP, ['documents'] for Serviceability).
export function ruleDrivers(rule: BaselineRule) { return [...new Set(rule.items.flatMap((item) => item.driver ? [item.driver] : []))] }

// Human-readable formula, e.g. "Documents: 2h × (14 + 11 × assets)".
export function describeRule(rule: BaselineRule) {
  const parts = [
    ...(Object.keys(rule.types).length ? [`Type: ${Object.entries(rule.types).map(([name, hours]) => `${name} ${hours}h`).join(' · ')}`] : []),
    ...rule.items.map((item) => {
      const units = [item.baseUnits ? String(item.baseUnits) : '', item.driver ? `${item.unitsPerDriver === 1 ? '' : `${item.unitsPerDriver} × `}${item.driver}` : ''].filter(Boolean).join(' + ') || '0'
      return `${item.label}: ${item.hoursPerUnit}h × ${units.includes('+') ? `(${units})` : units}`
    }),
    ...(rule.cap ? [`max ${rule.cap}h`] : []),
  ]
  return parts.join(' · ') || 'No rule lines yet'
}

export interface BaselineResult { total: number; fixed: number; lines: { label: string; units: number; hours: number }[]; capped: boolean; uncapped: number; missing: string[] }
export function baselineHours(rule: BaselineRule, scope: Pick<ScopeEntry, 'type' | 'drivers'>): BaselineResult {
  const typed = Object.keys(rule.types).length > 0
  const fixed = scope.type ? rule.types[scope.type] ?? 0 : 0
  const missing = [...(typed && (!scope.type || !(scope.type in rule.types)) ? ['type'] : []), ...ruleDrivers(rule).filter((driver) => scope.drivers[driver] == null)]
  const lines = rule.items.map((item) => {
    const units = item.baseUnits + (item.driver ? (scope.drivers[item.driver] ?? 0) * (item.unitsPerDriver ?? 0) : 0)
    return { label: item.label, units, hours: units * item.hoursPerUnit }
  })
  const uncapped = fixed + lines.reduce((sum, line) => sum + line.hours, 0)
  const capped = rule.cap != null && uncapped > rule.cap
  return { total: capped ? rule.cap! : uncapped, fixed, lines, capped, uncapped, missing }
}

const sameStream = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// One row per release (a Feature under a stream Epic that has a rule): current scope and baseline, the baseline at
// first scoping, and actual hours = Completed Work on that Feature's Time Writing Tasks across all months.
export interface ReleaseBaselineRow { stream: string; feature: AzureWorkItem; rule: BaselineRule; scope?: ReleaseScope; current?: BaselineResult; original?: BaselineResult; actual: number; variance: number | null; growth: number | null }
export function releaseBaselines(source: AzureWorkItem[], rules: BaselineRule[], scopes: ReleaseScope[]): ReleaseBaselineRow[] {
  const items = [...new Map(source.filter((item) => item.state.trim().toLowerCase() !== 'removed').map((item) => [item.key, item])).values()]
  const byId = new Map(items.map((item) => [item.id, item]))
  const featureOf = (item: AzureWorkItem) => { let current = item.parentId == null ? undefined : byId.get(item.parentId); const seen = new Set<number>(); while (current && current.workItemType !== 'Feature' && !seen.has(current.id)) { seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return current?.workItemType === 'Feature' ? current : undefined }
  const storyIds = new Set(items.filter((item) => isTimeWritingStory(item)).map((item) => item.id))
  const actual = new Map<number, number>()
  for (const task of items) {
    if (task.workItemType !== 'Task' || task.parentId == null || !storyIds.has(task.parentId)) continue
    const feature = featureOf(task)
    if (feature) actual.set(feature.id, (actual.get(feature.id) ?? 0) + (Number.isFinite(task.completedWork) ? Math.max(0, task.completedWork!) : 0))
  }
  const rows: ReleaseBaselineRow[] = []
  for (const rule of rules) {
    const epics = items.filter((item) => item.workItemType === 'Epic' && sameStream(item.title, rule.stream))
    for (const feature of items.filter((item) => item.workItemType === 'Feature' && epics.some((epic) => epic.id === item.parentId)).sort((a, b) => a.title.localeCompare(b.title))) {
      const scope = scopes.find((entry) => sameStream(entry.stream, rule.stream) && entry.release === feature.title)
      const current = scope ? baselineHours(rule, scope.history[scope.history.length - 1]) : undefined
      const original = scope ? baselineHours(rule, scope.history[0]) : undefined
      const booked = actual.get(feature.id) ?? 0
      rows.push({ stream: rule.stream, feature, rule, scope, current, original, actual: booked, variance: current ? booked - current.total : null, growth: current && original ? current.total - original.total : null })
    }
  }
  return rows
}
