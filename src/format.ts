// Display formatting shared by every page. Keep values as data; these only render them.
export function formatHours(value: number | null | undefined) { return value == null ? '—' : Number(value.toFixed(2)).toLocaleString() }
export function formatPercent(value: number | null | undefined, digits = 1) { return value == null ? '—' : `${value.toFixed(digits)}%` }
export function formatDate(value: string | undefined, fallback = '—') { return value ? value.slice(0, 10) : fallback }
export function formatDateTime(value: string | undefined, fallback = '—') { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : fallback }
export function monthName(month: string) { return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`)) }
export function todayIso() { return new Date().toISOString().slice(0, 10) }
