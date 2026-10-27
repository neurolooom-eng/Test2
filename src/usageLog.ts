// Who uses the app and when: one record per person (by the email of their Time Writing connection) in the Git data
// repository, usage/<email>.json, written at most once a day by the person's own app (so it needs a writable Git
// token). A record holds the days the app was opened, the first and last day, the app version and the platform —
// nothing about what was looked at or changed, and no credentials. Recording can be switched off by an Admin in
// Settings → Access (usageLog in access.json); the Usage section there summarises the records.
export interface UsageRecord { schema: 1; email: string; firstSeen: string; lastSeen: string; days: string[]; version: string; platform: 'web' | 'desktop' }
export interface UsagePerson { email: string; firstSeen: string; lastSeen: string; daysUsed: number; last7: number; last30: number; version: string; platform: 'web' | 'desktop' }
export interface UsageSummary { people: UsagePerson[]; active7: number; active30: number; byMonth: { month: string; people: number; days: number }[] }

export const usageFolder = 'usage'
const maxDays = 400
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isEmail = (value: unknown): value is string => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

// usage/<email>.json, the email lowercased with characters outside letters, digits, dot and dash replaced by "_".
export function usageFileName(email: string) {
  const safe = email.trim().toLowerCase().replace(/@/, '_at_').replace(/[^a-z0-9.-]+/g, '_')
  return safe ? `${usageFolder}/${safe}.json` : ''
}

export function parseUsageRecord(text: string): UsageRecord {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('A usage record in Git is not valid JSON.') }
  const input = raw as Partial<UsageRecord> | null
  if (!input || typeof input !== 'object' || input.schema !== 1 || !isEmail(input.email) || !Array.isArray(input.days)) throw new Error('A file in usage/ is not a usage record (schema 1 with email and days).')
  const days = [...new Set(input.days.filter(isDay))].sort().slice(-maxDays)
  return { schema: 1, email: input.email.trim().toLowerCase(), firstSeen: isDay(input.firstSeen) ? input.firstSeen : days[0] ?? '', lastSeen: isDay(input.lastSeen) ? input.lastSeen : days.at(-1) ?? '', days, version: typeof input.version === 'string' ? input.version : '', platform: input.platform === 'desktop' ? 'desktop' : 'web' }
}

// Today's use added to a person's record (a new one when none). Unchanged when today is already recorded with the
// same version and platform, so the app writes at most one commit per person per day.
export function recordUsage(current: UsageRecord | null, use: { email: string; today: string; version: string; platform: 'web' | 'desktop' }): { record: UsageRecord; changed: boolean } {
  const email = use.email.trim().toLowerCase()
  const base: UsageRecord = current && current.email === email ? current : { schema: 1, email, firstSeen: use.today, lastSeen: use.today, days: [], version: use.version, platform: use.platform }
  const changed = !base.days.includes(use.today) || base.version !== use.version || base.platform !== use.platform
  if (!changed) return { record: base, changed: false }
  const days = [...new Set([...base.days, use.today])].sort().slice(-maxDays)
  return { record: { schema: 1, email, firstSeen: base.firstSeen && base.firstSeen < use.today ? base.firstSeen : days[0], lastSeen: days.at(-1) ?? use.today, days, version: use.version, platform: use.platform }, changed: true }
}
export const serializeUsage = (record: UsageRecord) => `${JSON.stringify(record, null, 2)}\n`

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

// The records summarised as of today: per person, and how many people were active in the last 7 and 30 days, and per
// month how many people used the app on how many person-days.
export function usageSummary(records: UsageRecord[], today: string): UsageSummary {
  const people = records.map((record): UsagePerson => ({
    email: record.email, firstSeen: record.firstSeen, lastSeen: record.lastSeen, daysUsed: record.days.length,
    last7: record.days.filter((day) => daysBetween(day, today) < 7 && daysBetween(day, today) >= 0).length,
    last30: record.days.filter((day) => daysBetween(day, today) < 30 && daysBetween(day, today) >= 0).length,
    version: record.version, platform: record.platform,
  })).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.email.localeCompare(b.email))
  const months = new Map<string, { people: Set<string>; days: number }>()
  for (const record of records) for (const day of record.days) {
    const month = day.slice(0, 7)
    const entry = months.get(month) ?? { people: new Set<string>(), days: 0 }
    entry.people.add(record.email); entry.days += 1
    months.set(month, entry)
  }
  return { people, active7: people.filter((person) => person.last7 > 0).length, active30: people.filter((person) => person.last30 > 0).length, byMonth: [...months].sort(([a], [b]) => b.localeCompare(a)).map(([month, entry]) => ({ month, people: entry.people.size, days: entry.days })) }
}

// The browser remembers the last day it recorded, so that a reload does not read Git again that day.
export const usageMarkKey = 'demand-planning-usage-recorded-v1'
export const usageMark = (email: string, today: string, version: string, platform: string) => `${email.trim().toLowerCase()}|${today}|${version}|${platform}`
