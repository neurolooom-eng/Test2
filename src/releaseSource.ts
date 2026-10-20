import type { AzureWorkItem } from './domain'
import { mapAzureWorkItem, requestAzure, type AzureConfig, type AzureRequest } from './azureDevOps.ts'
import { pickFields, queryLayout } from './queryView.ts'

// Read-only release source: a second Azure project (e.g. DHFI) queried with a saved WIQL query.
// Approved documents carry the release identifier in their Area Path; streams group those releases.
export interface ReleaseSourceSettings { streamSegment: number; releasePattern?: string; approvalDateField?: string }
export const defaultReleaseSourceSettings: ReleaseSourceSettings = { streamSegment: 1 }
export interface ReleaseSourceSnapshot { organization: string; project: string; query: string; fetchedAt: string; items: AzureWorkItem[]; columns?: { ref: string; name: string }[]; orderBy?: { ref: string; desc: boolean }[] }
export interface ReleaseEntry { id: string; name: string; documents: number; items: AzureWorkItem[]; tracked: boolean; trackedBy: AzureWorkItem[]; approvalDate?: string; approvalMonth?: string }
export interface StreamReleases { stream: string; releases: ReleaseEntry[]; summary: string }

type Transport = (request: AzureRequest) => Promise<unknown>

export function normalizeReleaseSourceSettings(value: unknown): ReleaseSourceSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ReleaseSourceSettings, unknown>>
  const segment = Number(input.streamSegment)
  const pattern = typeof input.releasePattern === 'string' && input.releasePattern.trim() ? input.releasePattern.trim() : undefined
  const approvalDateField = typeof input.approvalDateField === 'string' && /^[\w.]{1,120}$/.test(input.approvalDateField.trim()) ? input.approvalDateField.trim() : undefined
  const base = { streamSegment: Number.isInteger(segment) && segment >= 1 ? segment : 1, ...(approvalDateField ? { approvalDateField } : {}) }
  if (pattern) { try { new RegExp(pattern, 'i') } catch { return base } }
  return { ...base, ...(pattern ? { releasePattern: pattern } : {}) }
}

// Accept a flat work-item query as pasted from Azure DevOps. Only its WHERE clause is kept so paging
// and the read-only guard in the Electron proxy ("SELECT [System.Id] FROM WorkItems WHERE …") stay in force.
export function releaseQueryWhere(wiql: string) {
  const text = wiql.replace(/\s+/g, ' ').trim()
  const match = /^SELECT\s+.+?\s+FROM\s+WorkItems\s+WHERE\s+(.+?)(?:\s+ORDER\s+BY\s+.+)?$/i.exec(text)
  if (!match) throw new Error('Paste a flat work-item query: SELECT … FROM WorkItems WHERE … (tree and link queries are not supported).')
  const where = match[1].trim()
  if (/\bASOF\b|\bMODE\s*\(/i.test(where)) throw new Error('Historical (ASOF) and link-mode queries are not supported.')
  if (where.length > 50000) throw new Error('The query is too long.')
  return where
}

export function pagedReleaseQuery(where: string, afterId: number) {
  return `SELECT [System.Id] FROM WorkItems WHERE (${where}) AND [System.Id] > ${afterId} ORDER BY [System.Id] ASC`
}

// "Author Approval Date" is a custom field; read it by the configured reference name, else by the first field whose name mentions an approval date.
export function approvalDateFrom(fields: Record<string, unknown>, settings: ReleaseSourceSettings = defaultReleaseSourceSettings) {
  const candidates = settings.approvalDateField ? [settings.approvalDateField] : Object.keys(fields).filter((key) => /approv\w*\.?\s*_?date|date\w*approv/i.test(key.replace(/[._]/g, ' ')))
  for (const key of candidates) { const value = fields[key]; if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value))) return value }
  return undefined
}

// Runs a flat WIQL query read-only: ids are paged by [System.Id] and read in batches of 200.
export const defaultReleaseQuery = "SELECT [System.Id], [System.Title], [System.AreaPath], [System.State]\nFROM WorkItems\nWHERE [System.TeamProject] = @project AND [System.State] = 'Approved'\nORDER BY [System.Id]"
export const projectQuery = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] <> 'Removed'"
export async function runWorkItemQuery(config: AzureConfig, pat: string, wiql: string, transport: Transport = requestAzure, map: (item: { id: number; fields: Record<string, unknown>; relations?: { rel: string; url: string }[] }) => AzureWorkItem = (item) => mapAzureWorkItem(item, config), limit = 20000): Promise<AzureWorkItem[]> {
  if (!config.organization || !config.project) throw new Error('The connection needs an organization and a project.')
  if (!pat.trim()) throw new Error('The connection needs a PAT with Work Items (Read).')
  const where = releaseQueryWhere(wiql)
  // The proxy requires a team on every read request; query and batch endpoints are project-scoped and ignore it.
  const scoped = { ...config, team: config.team || config.project }
  const request = (operation: AzureRequest['operation'], extra: Partial<AzureRequest> = {}) => transport({ ...scoped, pat: pat.trim(), operation, ...extra })
  const items: AzureWorkItem[] = []
  let afterId = 0
  while (true) {
    const page = await request('query', { query: pagedReleaseQuery(where, afterId) }) as { workItems?: { id: number }[] }
    if (!Array.isArray(page.workItems)) throw new Error('The query returned no work-item list. Check the query in Azure DevOps.')
    if (!page.workItems.length) break
    const ids = page.workItems.map((item) => item.id)
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= afterId)) throw new Error('Unexpected query paging response. Nothing was saved.')
    items.push(...await readWorkItems(request, ids, map))
    afterId = Math.max(...ids)
    if (items.length > limit) throw new Error(`The query returned more than ${limit.toLocaleString()} items. Narrow the query.`)
  }
  return items
}

type ItemRequest = (operation: AzureRequest['operation'], extra?: Partial<AzureRequest>) => Promise<unknown>
async function readWorkItems(request: ItemRequest, ids: number[], map: Parameters<typeof runWorkItemQuery>[4] & object) {
  const result: AzureWorkItem[] = []
  for (let index = 0; index < ids.length; index += 200) {
    const batchIds = ids.slice(index, index + 200)
    const batch = await request('items', { ids: batchIds }) as { value?: { id: number; fields: Record<string, unknown>; relations?: { rel: string; url: string }[] }[] }
    if (!Array.isArray(batch.value) || batch.value.length !== batchIds.length) throw new Error('Some work items could not be read. Nothing was saved.')
    result.push(...batch.value.map(map))
  }
  return result
}

// Adds the parents of query results (Story → Feature → Epic) that the query itself did not return, so a query-based
// Time Writing fetch still resolves streams and absence. Stops at the top of the hierarchy or after 10 levels.
export async function withAncestors(config: AzureConfig, pat: string, items: AzureWorkItem[], transport: Transport = requestAzure) {
  const scoped = { ...config, team: config.team || config.project }
  const request: ItemRequest = (operation, extra = {}) => transport({ ...scoped, pat: pat.trim(), operation, ...extra })
  const all = [...items], known = new Set(items.map((item) => item.id))
  for (let depth = 0; depth < 10; depth++) {
    const missing = [...new Set(all.map((item) => item.parentId).filter((id): id is number => id != null && !known.has(id)))]
    if (!missing.length) break
    const parents = await readWorkItems(request, missing, (item) => mapAzureWorkItem(item, config))
    for (const parent of parents) { known.add(parent.id); all.push(parent) }
  }
  return all
}

// columns: the field reference names to keep per item (the query's resolved SELECT list); read from the query text when not given.
export async function fetchReleaseSource(config: AzureConfig, pat: string, wiql: string, transport: Transport = requestAzure, settings: ReleaseSourceSettings = defaultReleaseSourceSettings, columns: string[] = queryLayout(wiql).columns): Promise<ReleaseSourceSnapshot> {
  if (!config.organization || !config.project) throw new Error('Select a release-source configuration with an organization and project.')
  if (!pat.trim()) throw new Error('The release-source configuration needs a Work Items (Read) PAT.')
  const items = await runWorkItemQuery(config, pat, wiql, transport, (item) => { const mapped = { ...mapAzureWorkItem(item, config), fields: pickFields(item.fields, columns) }; const approvalDate = approvalDateFrom(item.fields, settings); return approvalDate ? { ...mapped, approvalDate } : mapped })
  return { organization: config.organization, project: config.project, query: wiql.trim(), fetchedAt: new Date().toISOString(), items }
}

const segments = (areaPath: string) => areaPath.split('\\').map((part) => part.trim()).filter(Boolean)

// Release identifier: the configured capture pattern over the Area Path, else its last segment below the project.
export function releaseIdentifier(item: Pick<AzureWorkItem, 'areaPath'>, settings: ReleaseSourceSettings = defaultReleaseSourceSettings) {
  if (settings.releasePattern) {
    try { const match = new RegExp(settings.releasePattern, 'i').exec(item.areaPath); if (match) return (match[1] ?? match[0]).trim() } catch { /* invalid pattern: fall back to the last segment */ }
  }
  const parts = segments(item.areaPath)
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

// Stream: the Area Path segment at the configured depth (1 = first level below the project), only when the release sits deeper.
export function streamOf(item: Pick<AzureWorkItem, 'areaPath'>, settings: ReleaseSourceSettings = defaultReleaseSourceSettings) {
  const parts = segments(item.areaPath)
  return parts.length > settings.streamSegment + 1 ? parts[settings.streamSegment] : 'Unmapped'
}

export function approvalMonthOf(date: string | undefined) {
  if (!date || !Number.isFinite(Date.parse(date))) return undefined
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date(date))
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`
}

// Releases completed in a month: those whose approval date falls in it, with identifier, name and stream.
export function completedReleases(register: StreamReleases[], month: string) {
  return register.flatMap((stream) => stream.releases.filter((release) => release.approvalMonth === month).map((release) => ({ ...release, stream: stream.stream }))).sort((a, b) => (a.approvalDate ?? '').localeCompare(b.approvalDate ?? '') || a.id.localeCompare(b.id, undefined, { numeric: true }))
}

export function releaseRegister(source: AzureWorkItem[] | undefined, backlog: AzureWorkItem[], settings: ReleaseSourceSettings = defaultReleaseSourceSettings): StreamReleases[] {
  const streams = new Map<string, Map<string, ReleaseEntry>>()
  for (const item of source ?? []) {
    const release = releaseIdentifier(item, settings)
    if (!release) continue
    const stream = streamOf(item, settings)
    const byRelease = streams.get(stream) ?? new Map<string, ReleaseEntry>()
    streams.set(stream, byRelease)
    const entry = byRelease.get(release.toLowerCase()) ?? { id: release, name: item.title, documents: 0, items: [], tracked: false, trackedBy: [] }
    entry.documents += 1; entry.items.push(item)
    // The release's approval is the latest approved document's Author Approval Date.
    if (item.approvalDate && (!entry.approvalDate || item.approvalDate > entry.approvalDate)) { entry.approvalDate = item.approvalDate; entry.approvalMonth = approvalMonthOf(item.approvalDate); entry.name = item.title }
    byRelease.set(release.toLowerCase(), entry)
  }
  const trackedBy = (release: string) => backlog.filter((item) => ['Feature', 'User Story', 'Task'].includes(item.workItemType) && item.state.trim().toLowerCase() !== 'removed' && item.title.toLowerCase().includes(release.toLowerCase()))
  return [...streams].map(([stream, byRelease]) => {
    const releases = [...byRelease.values()].map((entry) => { const matches = trackedBy(entry.id); return { ...entry, tracked: matches.length > 0, trackedBy: matches } }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    return { stream, releases, summary: `${stream} (${releases.length}): ${releases.map((release) => release.id).join(', ')}` }
  }).sort((a, b) => (a.stream === 'Unmapped' ? 1 : 0) - (b.stream === 'Unmapped' ? 1 : 0) || b.releases.length - a.releases.length || a.stream.localeCompare(b.stream))
}
