import { normalizeVersion } from './releaseSource.ts'
import { windchillCell } from './windchillViews.ts'

// Releases in a Windchill export. Preferred source: the **Location** column (the document's folder path), whose folder
// names follow a few fixed shapes — the release name and number in one folder ("/Products/Remote Diagnostics 1.6/DHF")
// or in two ("/Remote Diagnostics/1.6/") — so a release is read from the deepest folder that holds a version
// (releaseFromLocation). Fallback: the document Name, which holds the release name(s), the release number(s) and then the
// document name, with any delimiters ("Remote Diagnostics 1.6 Verification Report", "IntelliSpace Portal - v12.1 -
// Test Plan", "CareLink_R3.2_SRS"). A document can be "clubbed" over several releases, name + number pairs one after
// the other: "Service1_rel1.0_Service2_rel2.3_Test Plan" or "Viewer 1.6 & 1.7 SRS". Every version in the name ends a
// release: its name is the text since the previous version (or the start); a version with no name before it (the
// "& 1.7") takes the previous release's name; the text after the last version is the document name. A version is two
// or more numbers joined by dots (1.6, 12.1.0.3), optionally after "v", "ver", "version", "R", "Rel" or "Release"; a
// single number counts only after one of those words ("Release 5", "rel2"); a version in brackets ("(v2)") is the
// document's revision and is skipped. Delimiters around names and versions
// (space, - _ | / : ; , + & "and", brackets) are dropped. The unique releases are name + number, ignoring case and
// spaces in the name and trailing zero parts in the number (3.1 = 3.1.0).
export interface DocumentRelease { name: string; release: string; document: string }
export interface WindchillRelease { key: string; name: string; release: string; documents: { name: string; row: Record<string, unknown> }[]; latest: string; locations: string[] }
export type ReleaseSource = 'location' | 'name'
export interface LocationRelease { name: string; release: string; folder: string }
export interface UniqueLocation { location: string; count: number; release?: LocationRelease }

const sep = String.raw`[\s_\-|/:;,+&([{]`
const prefix = String.raw`(?:v|ver\.?|version|r|rel\.?|release)[\s_.:-]*`
const versionToken = new RegExp(String.raw`(^|${sep}+)(?:${prefix})?(\d+(?:\.\d+)+)(?![\d.]*\d)|(^|${sep}+)${prefix}(\d+)(?![\d.])`, 'gi')
const trimSeparators = (text: string) => text.replace(/^(?:[\s_\-|/:;,.+&()[\]{}]|(?<![a-z0-9])and(?![a-z0-9]))+|(?:[\s_\-|/:;,.+&([{]|(?<![a-z0-9])and(?![a-z0-9]))+$/gi, '').replace(/\s+/g, ' ').trim()

// Every release a document name names, in order, with the document name (the text after the last version).
export function releasesFromDocumentName(text: string): DocumentRelease[] {
  const value = text.replace(/\s+/g, ' ').trim()
  const found: { name: string; release: string }[] = []
  let from = 0, end = 0
  for (const match of value.matchAll(versionToken)) {
    const lead = match[1] ?? match[3] ?? '', release = match[2] ?? match[4], at = match.index + lead.length
    // A version in brackets is the document's revision ("DHF Index (v2)"), not a release.
    if (/[([{]\s*$/.test(lead) && /^\s*[)\]}]/.test(value.slice(match.index + match[0].length))) continue
    const name = trimSeparators(value.slice(from, at)) || found.at(-1)?.name || ''
    if (name) found.push({ name, release })
    from = end = match.index + match[0].length
  }
  const document = trimSeparators(value.slice(end))
  return found.map((entry) => ({ ...entry, document }))
}
// The first release of a document name (kept for single-release callers).
export const releaseFromDocumentName = (text: string): DocumentRelease | undefined => releasesFromDocumentName(text)[0]

// The column holding the folder path: "Location" if the export has it, else the first column naming a location, folder or path.
export function locationColumn(columns: string[]) {
  return columns.find((column) => column.trim().toLowerCase() === 'location') ?? columns.find((column) => /location|folder|path/i.test(column))
}
const pureVersion = /^(?:v|ver\.?|version|r|rel\.?|release)?[\s_.:-]*(\d+(?:\.\d+)*)$/i
// The release a folder path names: the deepest folder that holds a name and a version ("Remote Diagnostics 1.6"), or a
// folder that is only a version under a folder that is the name ("Remote Diagnostics/1.6"). Folders after it (the
// document type, "DHF", "Test Reports") are ignored. Undefined when no folder holds a version.
export function releaseFromLocation(location: string): LocationRelease | undefined {
  const folders = location.split(/[\\/]+/).map((folder) => folder.trim()).filter(Boolean)
  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const folder = folders[index]
    const bare = pureVersion.exec(folder)
    if (bare && /\d/.test(bare[1])) {
      const parent = folders[index - 1]
      if (parent && !pureVersion.test(parent) && !releasesFromDocumentName(parent).length) return { name: trimSeparators(parent), release: bare[1], folder: folders.slice(0, index + 1).join('/') }
      continue
    }
    const found = releasesFromDocumentName(folder)
    if (found.length) return { name: found[0].name, release: found[0].release, folder: folders.slice(0, index + 1).join('/') }
  }
  return undefined
}
// Every distinct Location value with its document count and the release read from it, most documents first.
export function uniqueLocations(rows: Record<string, unknown>[], column: string): UniqueLocation[] {
  const counts = new Map<string, number>()
  for (const row of rows) { const location = windchillCell(row, column).trim(); if (location) counts.set(location, (counts.get(location) ?? 0) + 1) }
  return [...counts].map(([location, count]) => ({ location, count, release: releaseFromLocation(location) })).sort((a, b) => b.count - a.count || a.location.localeCompare(b.location))
}

// The column holding the document names: "Name" if the export has it, else the first column whose name contains "name".
export function documentNameColumn(columns: string[]) {
  return columns.find((column) => column.trim().toLowerCase() === 'name') ?? columns.find((column) => /name/i.test(column) && !/organi[sz]ation|context|creator|modifier/i.test(column)) ?? columns[0] ?? ''
}
const dateColumn = (columns: string[]) => columns.find((column) => /last modified|modified|released|date/i.test(column))

export interface ReleaseOptions { source?: ReleaseSource | 'auto'; nameColumn?: string; locationColumn?: string }
// Unique releases of an export. Source 'location' reads the Location column, 'name' the document names, 'auto' (the
// default) Location when the export has such a column, else the names. A document counts once per release it names.
export function windchillReleases(rows: Record<string, unknown>[], columns: string[], options: ReleaseOptions | string = {}) {
  const chosen = typeof options === 'string' ? { nameColumn: options } : options
  const nameColumn = chosen.nameColumn || documentNameColumn(columns)
  const location = chosen.locationColumn || locationColumn(columns)
  const source: ReleaseSource = chosen.source === 'name' || (chosen.source !== 'location' && !location) ? 'name' : 'location'
  const byKey = new Map<string, WindchillRelease>()
  const unmatched: string[] = []
  let clubbed = 0
  const date = dateColumn(columns)
  for (const row of rows) {
    const text = windchillCell(row, nameColumn).trim()
    const folder = source === 'location' && location ? windchillCell(row, location).trim() : ''
    const fromLocation = source === 'location' ? releaseFromLocation(folder) : undefined
    const found: { name: string; release: string; document: string }[] = source === 'location' ? (fromLocation ? [{ ...fromLocation, document: text }] : []) : releasesFromDocumentName(text)
    if (!found.length) { if (text || folder) unmatched.push(source === 'location' ? folder || text : text); continue }
    if (found.length > 1) clubbed += 1
    const when = date ? windchillCell(row, date) : ''
    // A clubbed document counts for each release it names (once per release).
    for (const release of found) {
      const key = `${release.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}\u0000${normalizeVersion(release.release)}`
      const entry = byKey.get(key) ?? { key, name: release.name, release: release.release, documents: [], latest: '', locations: [] }
      if (entry.documents.some((doc) => doc.row === row)) continue
      entry.documents.push({ name: release.document || text, row })
      if (folder && !entry.locations.includes(folder)) entry.locations.push(folder)
      if (when > entry.latest) entry.latest = when
      byKey.set(key, entry)
    }
  }
  const releases = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || b.release.localeCompare(a.release, undefined, { numeric: true }))
  const locations = source === 'location' && location ? uniqueLocations(rows, location) : []
  return { releases, unmatched, clubbed, nameColumn, locationColumn: location, source, locations, dateColumn: date }
}

// The analysis file saved to the Git data repository (windchill-analysis/<export>-locations.json): every distinct
// Location with its document count and the release read from it, plus the unique releases — so that the folder
// naming can be studied and the parser checked against the real exports. No document contents, no credentials.
export interface WindchillLocationsFile { schema: 1; kind: 'windchill-locations'; viewId: string; export: string; column: string; generatedAt: string; documents: number; locations: UniqueLocation[]; releases: { name: string; release: string; documents: number; locations: string[] }[] }
export const windchillAnalysisFolder = 'windchill-analysis'
export function windchillLocationsFile(view: { id: string; name: string }, result: ReturnType<typeof windchillReleases>, documents: number, generatedAt = new Date().toISOString()): WindchillLocationsFile {
  return { schema: 1, kind: 'windchill-locations', viewId: view.id, export: view.name, column: result.locationColumn ?? '', generatedAt, documents, locations: result.locations, releases: result.releases.map((entry) => ({ name: entry.name, release: entry.release, documents: entry.documents.length, locations: entry.locations })) }
}
