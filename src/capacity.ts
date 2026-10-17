import type { AzureWorkItem } from './domain'
import { timeWritingMonth, workingDays } from './azureInsights.ts'

// Capacity model for the selected month. Source rows are the Time Writing Tasks named
// "<Month> <Year> | …" under "… - Time Writing" User Stories; absence is everything under the
// configured absence Epic, where each person has a Feature for PTO / Sick Leave / Unplanned Leave.
export interface CapacitySettings { absenceEpicId: number; hoursPerDay: number; overloadedAt: number; availableBelow: number }
export const defaultCapacitySettings: CapacitySettings = { absenceEpicId: 37778, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80 }
export type LoadStatus = 'Overloaded' | 'Balanced' | 'Has capacity' | 'No bookings'
export type AbsenceKind = 'PTO' | 'Sick Leave' | 'Unplanned Leave' | 'Other absence'
export const absenceKinds: AbsenceKind[] = ['PTO', 'Sick Leave', 'Unplanned Leave', 'Other absence']

export interface StreamLoad { key: string; epic?: AzureWorkItem; title: string; work: number; planned: number; tasks: number }
export interface PersonLoad {
  name: string; funded: number; absence: number; absenceByKind: Record<AbsenceKind, number>; available: number
  work: number; planned: number; utilization: number | null; plannedUtilization: number | null; status: LoadStatus; tasks: number; streams: StreamLoad[]
}
export interface StreamSummary extends StreamLoad { people: number; features: number; share: number | null }

export function normalizeCapacitySettings(value: unknown): CapacitySettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof CapacitySettings, unknown>>
  const number = (key: keyof CapacitySettings, min: number) => { const candidate = Number(input[key]); return Number.isFinite(candidate) && candidate >= min ? candidate : defaultCapacitySettings[key] }
  const settings = { absenceEpicId: Math.trunc(number('absenceEpicId', 1)), hoursPerDay: number('hoursPerDay', 0.25), overloadedAt: number('overloadedAt', 1), availableBelow: number('availableBelow', 0) }
  return settings.availableBelow < settings.overloadedAt ? settings : { ...settings, availableBelow: defaultCapacitySettings.availableBelow, overloadedAt: defaultCapacitySettings.overloadedAt }
}

export function absenceKind(titles: string[]): AbsenceKind {
  const text = titles.join(' ').toLowerCase()
  if (/\bunplanned\b|\bemergency\b/.test(text)) return 'Unplanned Leave'
  if (/\bsick\b|\bmedical\b/.test(text)) return 'Sick Leave'
  if (/\bpto\b|\bvacation\b|\bholiday\b|\bannual leave\b|\bplanned leave\b/.test(text)) return 'PTO'
  return 'Other absence'
}

export function loadStatus(utilization: number | null, settings: CapacitySettings): LoadStatus {
  if (utilization == null) return 'No bookings'
  if (utilization >= settings.overloadedAt) return 'Overloaded'
  if (utilization < settings.availableBelow) return 'Has capacity'
  return 'Balanced'
}

const hours = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const percent = (numerator: number, denominator: number) => denominator > 0 ? Math.round(numerator / denominator * 10000) / 100 : null

export function capacityModel(source: AzureWorkItem[], month: string, settings: CapacitySettings = defaultCapacitySettings) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.')
  const items = [...new Map(source.filter(item => item.state.trim().toLowerCase() !== 'removed').map(item => [item.key, item])).values()]
  const byId = new Map(items.map(item => [item.id, item]))
  const ancestors = (item: AzureWorkItem) => {
    const chain: AzureWorkItem[] = []; const seen = new Set<number>([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId)
    while (current && !seen.has(current.id)) { chain.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) }
    return chain
  }
  const storyIds = new Set(items.filter(item => item.workItemType === 'User Story' && /\s*-\s*time\s*writ(?:ing|ting)\s*$/i.test(item.title)).map(item => item.id))
  const monthlyTasks = items.filter(item => item.workItemType === 'Task' && item.parentId != null && storyIds.has(item.parentId) && timeWritingMonth(item.title) === month)
  const funded = workingDays(month) * settings.hoursPerDay
  const people = new Map<string, PersonLoad & { streamMap: Map<string, StreamLoad> }>()
  const streams = new Map<string, StreamSummary & { names: Set<string>; featureKeys: Set<string> }>()
  const emptyKinds = (): Record<AbsenceKind, number> => ({ 'PTO': 0, 'Sick Leave': 0, 'Unplanned Leave': 0, 'Other absence': 0 })
  for (const task of monthlyTasks) {
    const chain = ancestors(task)
    const epic = chain.find(item => item.workItemType === 'Epic')
    const feature = chain.find(item => item.workItemType === 'Feature')
    const name = task.assignedTo || feature?.assignedTo || 'Unassigned'
    const person = people.get(name) ?? { name, funded, absence: 0, absenceByKind: emptyKinds(), available: funded, work: 0, planned: 0, utilization: null, plannedUtilization: null, status: 'No bookings' as LoadStatus, tasks: 0, streams: [], streamMap: new Map() }
    people.set(name, person)
    const work = hours(task.completedWork), planned = hours(task.originalEstimate)
    if (epic?.id === settings.absenceEpicId) {
      const kind = absenceKind([task.title, ...chain.map(item => item.title)])
      person.absence += work; person.absenceByKind[kind] += work
      continue
    }
    person.work += work; person.planned += planned; person.tasks += 1
    const key = epic?.key ?? 'unmapped', title = epic?.title ?? 'No Epic path'
    const personStream = person.streamMap.get(key) ?? { key, epic, title, work: 0, planned: 0, tasks: 0 }
    personStream.work += work; personStream.planned += planned; personStream.tasks += 1; person.streamMap.set(key, personStream)
    const stream = streams.get(key) ?? { key, epic, title, work: 0, planned: 0, tasks: 0, people: 0, features: 0, share: null, names: new Set<string>(), featureKeys: new Set<string>() }
    stream.work += work; stream.planned += planned; stream.tasks += 1; stream.names.add(name); if (feature) stream.featureKeys.add(feature.key); streams.set(key, stream)
  }
  const totalWork = [...streams.values()].reduce((sum, stream) => sum + stream.work, 0)
  const personList: PersonLoad[] = [...people.values()].map(person => {
    const available = Math.max(0, person.funded - person.absence)
    const utilization = person.tasks ? percent(person.work, available) : null
    const { streamMap, ...rest } = person
    return { ...rest, available, utilization, plannedUtilization: person.tasks ? percent(person.planned, available) : null, status: loadStatus(utilization, settings), streams: [...streamMap.values()].sort((a, b) => b.work - a.work) }
  }).sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1) || a.name.localeCompare(b.name))
  const streamList: StreamSummary[] = [...streams.values()].map(({ names, featureKeys, ...stream }) => ({ ...stream, people: names.size, features: featureKeys.size, share: percent(stream.work, totalWork) })).sort((a, b) => b.work - a.work)
  const totals = { funded: funded * personList.length, absence: personList.reduce((sum, person) => sum + person.absence, 0), work: totalWork, planned: personList.reduce((sum, person) => sum + person.planned, 0) }
  const available = Math.max(0, totals.funded - totals.absence)
  const absenceByKind = personList.reduce((kinds, person) => { for (const kind of absenceKinds) kinds[kind] += person.absenceByKind[kind]; return kinds }, emptyKinds())
  return {
    month, settings, workingDays: workingDays(month), fundedPerPerson: funded, monthlyTasks, people: personList, streams: streamList,
    totals: { ...totals, available, absenceByKind, utilization: personList.some(person => person.tasks) ? percent(totals.work, available) : null },
    counts: { overloaded: personList.filter(person => person.status === 'Overloaded').length, balanced: personList.filter(person => person.status === 'Balanced').length, hasCapacity: personList.filter(person => person.status === 'Has capacity').length, noBookings: personList.filter(person => person.status === 'No bookings').length },
  }
}
export type CapacityModel = ReturnType<typeof capacityModel>

// Funded, available and actual hours per month for the trend chart; months without any Time Writing Task are gaps.
export interface MonthlyHours { month: string; funded: number | null; available: number | null; actual: number | null; planned: number | null; absence: number; people: number; workingDays: number }
export function monthlyHours(source: AzureWorkItem[], endMonth: string, span = 12, settings: CapacitySettings = defaultCapacitySettings): MonthlyHours[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) throw new Error('Choose a valid month.')
  return Array.from({ length: span }, (_, index) => {
    const date = new Date(`${endMonth}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - (span - 1 - index))
    const month = date.toISOString().slice(0, 7)
    const model = capacityModel(source, month, settings)
    const booked = model.people.some((person) => person.tasks)
    return { month, funded: model.people.length ? model.totals.funded : null, available: model.people.length ? model.totals.available : null, actual: booked ? model.totals.work : null, planned: booked ? model.totals.planned : null, absence: model.totals.absence, people: model.people.length, workingDays: model.workingDays }
  })
}
