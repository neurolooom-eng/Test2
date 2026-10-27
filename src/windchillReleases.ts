import { normalizeVersion } from './releaseSource.ts'
import { windchillCell } from './windchillViews.ts'

// Releases in a Windchill export: each document's Name holds the release name, the release number and then the
// document name ("Remote Diagnostics 1.6 Verification Report", "IntelliSpace Portal - v12.1 - Test Plan",
// "CareLink_R3.2_SRS"). The first version in the name splits it: before = release name, the version = release number,
// after = document name. A version is two or more numbers joined by dots (1.6, 12.1.0.3), optionally after "v",
// "ver", "version", "R", "Rel" or "Release"; a single number counts only after one of those words ("Release 5").
// Separators around it (space, -, _, |, /, :, comma, brackets) are dropped. The unique releases are name + number,
// ignoring case and spaces in the name and trailing zero parts in the number (3.1 = 3.1.0).
export interface DocumentRelease { name: string; release: string; document: string }
export interface WindchillRelease { key: string; name: string; release: string; documents: { name: string; row: Record<string, unknown> }[]; latest: string }

const versionToken = /(^|[\s_\-|/:,([{]+)(?:(?:v|ver\.?|version|r|rel\.?|release)[\s_.:-]*)?(\d+(?:\.\d+)+)(?![\d.]*\d)|(^|[\s_\-|/:,([{]+)(?:v|ver\.?|version|r|rel\.?|release)[\s_.:-]*(\d+)(?![\d.])/i
const trimSeparators = (text: string) => text.replace(/^[\s_\-|/:,.()[\]{}]+|[\s_\-|/:,.([{]+$/g, '').replace(/\s+/g, ' ').trim()

export function releaseFromDocumentName(text: string): DocumentRelease | undefined {
  const value = text.replace(/\s+/g, ' ').trim()
  const match = versionToken.exec(value)
  if (!match) return undefined
  const lead = match[1] ?? match[3] ?? '', release = match[2] ?? match[4]
  const at = match.index + lead.length
  const name = trimSeparators(value.slice(0, at)), document = trimSeparators(value.slice(match.index + match[0].length))
  if (!name) return undefined
  return { name, release, document }
}

// The column holding the document names: "Name" if the export has it, else the first column whose name contains "name".
export function documentNameColumn(columns: string[]) {
  return columns.find((column) => column.trim().toLowerCase() === 'name') ?? columns.find((column) => /name/i.test(column) && !/organi[sz]ation|context|creator|modifier/i.test(column)) ?? columns[0] ?? ''
}
const dateColumn = (columns: string[]) => columns.find((column) => /last modified|modified|released|date/i.test(column))

export function windchillReleases(rows: Record<string, unknown>[], columns: string[], nameColumn = documentNameColumn(columns)) {
  const byKey = new Map<string, WindchillRelease>()
  const unmatched: string[] = []
  const date = dateColumn(columns)
  for (const row of rows) {
    const text = windchillCell(row, nameColumn)
    const found = releaseFromDocumentName(text)
    if (!found) { if (text.trim()) unmatched.push(text.trim()); continue }
    const key = `${found.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}\u0000${normalizeVersion(found.release)}`
    const entry = byKey.get(key) ?? { key, name: found.name, release: found.release, documents: [], latest: '' }
    entry.documents.push({ name: found.document || text, row })
    const when = date ? windchillCell(row, date) : ''
    if (when > entry.latest) entry.latest = when
    byKey.set(key, entry)
  }
  const releases = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || b.release.localeCompare(a.release, undefined, { numeric: true }))
  return { releases, unmatched, nameColumn, dateColumn: date }
}
