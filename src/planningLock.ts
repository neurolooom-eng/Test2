import type { MonthLock } from './capacity.ts'
import { timeWritingMonth } from './azureInsights.ts'

// Month locks (MON-06, MON-07, MON-21…MON-24): every month M has its own plan lock date and actuals lock date — by
// default the plan lock day of M (5th) and the actuals lock day of M+1 (4th), both set in Settings → Capacity &
// periods — and Settings can move either date for one month or lock it early. The day itself is still open; the lock
// starts at the end of that day, in the viewer's local time. Everything is kept with the capacity settings in Git, so
// every computer sees the same locks, and each is worked out from the current time, so a new month starts open. The
// Monthly Time Writing page and the Task creation paths (New Feature, Complete children, Bulk actions month Tasks, the
// Edit form) share these rules: a Time Writing Task created after planning has locked is tagged ad-hoc.
export interface LockSettings { planLockDay?: number; actualsLockDay?: number; monthLocks?: Record<string, MonthLock> }
export const defaultPlanLockDay = 5
export const defaultActualsLockDay = 4
const pad = (value: number) => String(value).padStart(2, '0')
export const nextMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7) }
export const planLockDate = (settings: LockSettings, month: string) => settings.monthLocks?.[month]?.planOn ?? `${month}-${pad(settings.planLockDay ?? defaultPlanLockDay)}`
export const actualsLockDate = (settings: LockSettings, month: string) => settings.monthLocks?.[month]?.actualsOn ?? `${nextMonth(month)}-${pad(settings.actualsLockDay ?? defaultActualsLockDay)}`
// The lock starts when the lock day ends (local time).
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999`)
export function planningLocked(settings: LockSettings, month: string, now = new Date()) {
  return Boolean(settings.monthLocks?.[month]?.planLocked) || now > endOfDay(planLockDate(settings, month))
}
export function actualsLocked(settings: LockSettings, month: string, now = new Date()) {
  return Boolean(settings.monthLocks?.[month]?.actualsLocked) || now > endOfDay(actualsLockDate(settings, month))
}

// The lock settings of Settings, kept current by the App, so the creation paths outside the Monthly page can check them.
let current: LockSettings = {}
export const setLockSettings = (next: LockSettings) => { current = next }
export const planningLockedNow = (month: string, now = new Date()) => planningLocked(current, month, now)
// A month Task title's month ("October 2026") is locked for planning now: a new Task for it is tagged ad-hoc.
export const adhocAfterLock = (monthLabel: string, now = new Date()) => { const month = timeWritingMonth(monthLabel); return Boolean(month && planningLockedNow(month, now)) }
export const actualsLockedNow = (month: string, now = new Date()) => actualsLocked(current, month, now)
