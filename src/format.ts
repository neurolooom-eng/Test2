// Display formatting shared by every page. Keep values as data; these only render them.
export function formatHours(value: number | null | undefined) { return value == null ? '—' : Number(value.toFixed(2)).toLocaleString() }
export function formatPercent(value: number | null | undefined, digits = 1) { return value == null ? '—' : `${value.toFixed(digits)}%` }
export function formatDate(value: string | undefined, fallback = '—') { return value ? value.slice(0, 10) : fallback }
export function formatDateTime(value: string | undefined, fallback = '—') { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : fallback }
export function monthName(month: string) { return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`)) }
export function todayIso() { return new Date().toISOString().slice(0, 10) }
export function localTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time' } catch { return 'Local time' } }
export function timeZoneLabel(date = new Date()) {
  try { return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? localTimeZone() } catch { return localTimeZone() }
}
// "just now", "5 min ago", "3 h ago", "2 days ago"; falls back to the absolute local date beyond a week.
export function relativeTime(value: string | undefined, now: Date = new Date(), fallback = '—') {
  if (!value || !Number.isFinite(Date.parse(value))) return fallback
  const seconds = Math.round((now.getTime() - Date.parse(value)) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 90) return '1 min ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(value).toLocaleDateString()
}
