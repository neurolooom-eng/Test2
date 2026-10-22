import type { AzureWorkItem } from './domain'
import { capacityModel, defaultCapacitySettings, type CapacitySettings, type Region, type ResourceRole } from './capacity.ts'
import { isMonthTask, timeWritingMonth } from './azureInsights.ts'

// Overview dashboard: one record per person and month from the Time Writing data — planned hours (Original Estimate),
// actual hours (Completed Work) and capacity (working days × hours per day, less absence and regional holidays) —
// filtered by region, role, person and stream, and the analyses built on them. Absence is never demand: it lowers
// capacity. Capacity is counted once per person and month.

export type MonthStatus = 'elapsed' | 'partial' | 'future'
export interface DashboardFilter { region?: Region; role?: ResourceRole; person?: string; stream?: string }
export interface StreamHours { key: string; title: string; plan: number; actual: number }
export interface PersonMonth { month: string; status: MonthStatus; person: string; region?: Region; role?: ResourceRole; plan: number; actual: number; capacity: number; absence: number; tasks: number; planLines: number; blankActuals: number; streams: StreamHours[] }
export interface Totals { plan: number; actual: number; capacity: number; absence: number; people: number; planUtil: number | null; actualUtil: number | null; gap: number; ratio: number | null }

const ratio = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null
const round = (value: number) => Math.round(value * 100) / 100

export function monthRange(end: string, span: number) {
  return Array.from({ length: span }, (_, index) => { const date = new Date(`${end}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - (span - 1 - index)); return date.toISOString().slice(0, 7) })
}
export function monthStatus(month: string, today: string): MonthStatus {
  const current = today.slice(0, 7)
  return month < current ? 'elapsed' : month === current ? 'partial' : 'future'
}

// Periods offered on the Overview, all relative to the month picked in the header.
export const periods = [
  { key: 'month', label: 'Selected month' },
  { key: '3', label: 'Last 3 months' },
  { key: '6', label: 'Last 6 months' },
  { key: '12', label: 'Last 12 months' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'year', label: 'Whole year (incl. future plans)' },
] as const
export type PeriodKey = typeof periods[number]['key']
export function periodMonths(period: PeriodKey, month: string) {
  const year = month.slice(0, 4), number = Number(month.slice(5))
  if (period === 'month') return [month]
  if (period === 'ytd') return monthRange(month, number)
  if (period === 'year') return monthRange(`${year}-12`, 12)
  return monthRange(month, Number(period))
}

export function personMonths(source: AzureWorkItem[], months: string[], today: string, settings: CapacitySettings = defaultCapacitySettings): PersonMonth[] {
  const profiles = settings.profiles ?? {}
  const byId = new Map(source.map((item) => [item.id, item]))
  const epicOf = (item: AzureWorkItem) => { const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { if (current.workItemType === 'Epic') return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return undefined }
  const rows: PersonMonth[] = []
  for (const month of months) {
    const model = capacityModel(source, month, settings)
    // Planned lines and blank actuals per person (month Tasks outside the absence Epic with an estimate).
    const lines = new Map<string, { planLines: number; blankActuals: number }>()
    for (const task of source) {
      if (!isMonthTask(task) || timeWritingMonth(task.title) !== month || task.state.trim().toLowerCase() === 'removed' || !(task.originalEstimate && task.originalEstimate > 0)) continue
      if (epicOf(task)?.id === settings.absenceEpicId) continue
      const entry = lines.get(task.assignedTo) ?? { planLines: 0, blankActuals: 0 }
      entry.planLines++; if (task.completedWork == null) entry.blankActuals++
      lines.set(task.assignedTo, entry)
    }
    for (const person of model.people) {
      if (person.name === 'Unassigned') continue
      const profile = profiles[person.name]
      rows.push({
        month, status: monthStatus(month, today), person: person.name, region: profile?.region, role: profile?.role,
        plan: round(person.planned), actual: round(person.work), capacity: round(person.available), absence: round(person.absence), tasks: person.tasks,
        planLines: lines.get(person.name)?.planLines ?? 0, blankActuals: lines.get(person.name)?.blankActuals ?? 0,
        streams: person.streams.map((stream) => ({ key: stream.key, title: stream.title, plan: round(stream.planned), actual: round(stream.work) })),
      })
    }
  }
  return rows
}

// Region, role and person narrow the people; a stream narrows the hours to that Epic and the people to those with
// hours in it (their capacity is still counted whole).
export function applyFilter(rows: PersonMonth[], filter: DashboardFilter): PersonMonth[] {
  return rows.filter((row) => (!filter.region || row.region === filter.region) && (!filter.role || row.role === filter.role) && (!filter.person || row.person === filter.person))
    .flatMap((row) => {
      if (!filter.stream) return [row]
      const stream = row.streams.find((entry) => entry.key === filter.stream)
      return stream ? [{ ...row, plan: stream.plan, actual: stream.actual, streams: [stream] }] : []
    })
}

export function totals(rows: PersonMonth[]): Totals {
  const plan = round(rows.reduce((sum, row) => sum + row.plan, 0)), actual = round(rows.reduce((sum, row) => sum + row.actual, 0)), capacity = round(rows.reduce((sum, row) => sum + row.capacity, 0))
  return { plan, actual, capacity, absence: round(rows.reduce((sum, row) => sum + row.absence, 0)), people: new Set(rows.map((row) => row.person)).size, planUtil: ratio(plan, capacity), actualUtil: ratio(actual, capacity), gap: round(capacity - plan), ratio: ratio(actual, plan) }
}

export function groupBy<K extends string>(rows: PersonMonth[], key: (row: PersonMonth) => K) {
  const groups = new Map<K, PersonMonth[]>()
  for (const row of rows) { const value = key(row); groups.set(value, [...(groups.get(value) ?? []), row]) }
  return [...groups].map(([name, entries]) => ({ name, rows: entries, ...totals(entries) }))
}

// People whose total planned hours over the period exceed their capacity.
export function plannedOverload(rows: PersonMonth[]) {
  const people = groupBy(rows, (row) => row.person)
  return { over: people.filter((person) => person.plan > person.capacity).map((person) => person.name), people: people.length }
}

// Persistent overload: above 100% of capacity in at least `streak` consecutive elapsed months (missing months break it).
export function persistentOverload(rows: PersonMonth[], months: string[], measure: 'actual' | 'plan', streak = 3) {
  const elapsed = months.filter((month) => rows.some((row) => row.month === month && row.status === 'elapsed'))
  const names = [...new Set(rows.map((row) => row.person))].sort()
  return names.filter((name) => {
    let run = 0, best = 0
    for (const month of elapsed) {
      const row = rows.find((entry) => entry.person === name && entry.month === month)
      run = row && row.capacity > 0 && row[measure] > row.capacity ? run + 1 : 0
      best = Math.max(best, run)
    }
    return best >= streak
  })
}

// Concentration: the top 20% of people (rounded up) by hours, their share of the hours and of the capacity.
export function concentration(rows: PersonMonth[], measure: 'actual' | 'plan') {
  const people = groupBy(rows, (row) => row.person).sort((a, b) => b[measure] - a[measure])
  const all = totals(rows), top = people.slice(0, Math.ceil(people.length * 0.2))
  const hours = top.reduce((sum, person) => sum + person[measure], 0), capacity = top.reduce((sum, person) => sum + person.capacity, 0)
  const hoursShare = ratio(hours, all[measure]), capacityShare = ratio(capacity, all.capacity)
  return { top: top.map((person) => ({ name: person.name, hours: person[measure] })), of: people.length, hoursShare, capacityShare, alert: hoursShare != null && capacityShare != null && hoursShare - capacityShare >= 10 }
}

// Rebalancing within the same role and month: overload (plan above capacity) can only move to headroom of that role
// in that month. People without a role are left out.
export function rebalancing(rows: PersonMonth[]) {
  let overload = 0, headroom = 0, movable = 0
  const receivers: { person: string; month: string; role?: string; region?: string; plan: number; headroom: number }[] = []
  const needs: { person: string; month: string; role?: string; region?: string; plan: number; capacity: number; need: number; actual: number }[] = []
  for (const group of groupBy(rows, (row) => `${row.month}|${row.role ?? ''}`)) {
    let over = 0, room = 0
    for (const row of group.rows) {
      const diff = row.plan - row.capacity
      if (diff > 0) { over += diff; needs.push({ person: row.person, month: row.month, role: row.role, region: row.region, plan: row.plan, capacity: row.capacity, need: round(diff), actual: row.actual }) }
      else if (diff < 0 && row.status !== 'elapsed') { room += -diff; receivers.push({ person: row.person, month: row.month, role: row.role, region: row.region, plan: row.plan, headroom: round(-diff) }) }
    }
    overload += over; headroom += room
    if (group.rows[0]?.role) movable += Math.min(over, room)
  }
  return { overload: round(overload), headroom: round(headroom), movable: round(movable), shortfall: round(overload - movable), needs: needs.sort((a, b) => b.need - a.need), receivers: receivers.sort((a, b) => b.headroom - a.headroom) }
}

// Hours per Epic over the rows.
export function streamTotals(rows: PersonMonth[]) {
  const streams = new Map<string, StreamHours & { people: Set<string> }>()
  for (const row of rows) for (const stream of row.streams) {
    const entry = streams.get(stream.key) ?? { key: stream.key, title: stream.title, plan: 0, actual: 0, people: new Set<string>() }
    entry.plan += stream.plan; entry.actual += stream.actual; entry.people.add(row.person); streams.set(stream.key, entry)
  }
  const plan = [...streams.values()].reduce((sum, stream) => sum + stream.plan, 0)
  return [...streams.values()].map(({ people, ...stream }) => ({ ...stream, plan: round(stream.plan), actual: round(stream.actual), people: [...people].sort(), share: ratio(stream.plan, plan) })).sort((a, b) => b.plan - a.plan || a.title.localeCompare(b.title))
}

// Month-on-month change of actual hours by a dimension (role, stream, person, …); undefined = nothing that month.
export type Dimension = (row: PersonMonth) => { name: string; actual: number }[]
export const byRole: Dimension = (row) => [{ name: row.role ?? 'No role', actual: row.actual }]
export const byRegion: Dimension = (row) => [{ name: row.region ?? 'No region', actual: row.actual }]
export const byPerson: Dimension = (row) => [{ name: row.person, actual: row.actual }]
export const byStream: Dimension = (row) => row.streams.map((stream) => ({ name: stream.title, actual: stream.actual }))
export function change(rows: PersonMonth[], previous: string, current: string, dimension: Dimension) {
  const sum = (month: string) => { const map = new Map<string, number>(); for (const row of rows) if (row.month === month) for (const entry of dimension(row)) map.set(entry.name, (map.get(entry.name) ?? 0) + entry.actual); return map }
  const before = sum(previous), after = sum(current)
  return [...new Set([...before.keys(), ...after.keys()])].map((name) => {
    const a = before.get(name), b = after.get(name)
    return { name, previous: a == null ? undefined : round(a), current: b == null ? undefined : round(b), change: a != null && b != null ? round(b - a) : undefined, percent: a != null && b != null && a > 0 ? Math.round((b - a) / a * 1000) / 10 : undefined }
  }).sort((x, y) => Math.abs(y.change ?? 0) - Math.abs(x.change ?? 0) || x.name.localeCompare(y.name))
}
