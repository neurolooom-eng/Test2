import type { AzureWorkItem } from './domain'
import { mapAzureWorkItem, requestAzure, type AzureConfig, type AzureRequest } from './azureDevOps.ts'

// Read-only release source: a second Azure project (e.g. DHFI) queried with a saved WIQL query.
// Approved documents carry the release identifier in their Area Path; streams group those releases.
export interface ReleaseSourceSettings { streamSegment: number; releasePattern?: string }
export const defaultReleaseSourceSettings: ReleaseSourceSettings = { streamSegment: 1 }
export interface ReleaseSourceSnapshot { organization: string; project: string; query: string; fetchedAt: string; items: AzureWorkItem[] }
export interface ReleaseEntry { id: string; documents: number; items: AzureWorkItem[]; tracked: boolean; trackedBy: AzureWorkItem[] }
export interface StreamReleases { stream: string; releases: ReleaseEntry[]; summary: string }

type Transport = (request: AzureRequest) => Promise<unknown>

export function normalizeReleaseSourceSettings(value: unknown): ReleaseSourceSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ReleaseSourceSettings, unknown>>
  const segment = Number(input.streamSegment)
  const pattern = typeof input.releasePattern === 'string' && input.releasePattern.trim() ? input.releasePattern.trim() : undefined
  if (pattern) { try { new RegExp(pattern, 'i') } catch { return { streamSegment: Number.isInteger(segment) && segment >= 1 ? segment : 1 } } }
  return { streamSegment: Number.isInteger(segment) && segment >= 1 ? segment : 1, ...(pattern ? { releasePattern: pattern } : {}) }
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

export async function fetchReleaseSource(config: AzureConfig, pat: string, wiql: string, transport: Transport = requestAzure): Promise<ReleaseSourceSnapshot> {
  if (!config.organization || !config.project) throw new Error('Select a release-source configuration with an organization and project.')
  if (!pat.trim()) throw new Error('The release-source configuration needs a Work Items (Read) PAT.')
  const where = releaseQueryWhere(wiql)
  // The proxy requires a team on every read request; query and batch endpoints are project-scoped and ignore it.
  const scoped = { ...config, team: config.team || config.project }
  const request = (operation: AzureRequest['operation'], extra: Partial<AzureRequest> = {}) => transport({ ...scoped, pat: pat.trim(), operation, ...extra })
  const items: AzureWorkItem[] = []
  let afterId = 0
  while (true) {
    const page = await request('query', { query: pagedReleaseQuery(where, afterId) }) as { workItems?: { id: number }[] }
    if (!Array.isArray(page.workItems)) throw new Error('The release query returned no work-item list. Check the query in Azure DevOps.')
    if (!page.workItems.length) break
    const ids = page.workItems.map((item) => item.id)
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= afterId)) throw new Error('Unexpected query paging response. Nothing was saved.')
    for (let index = 0; index < ids.length; index += 200) {
      const batchIds = ids.slice(index, index + 200)
      const batch = await request('items', { ids: batchIds }) as { value?: { id: number; fields: Record<string, unknown> }[] }
      if (!Array.isArray(batch.value) || batch.value.length !== batchIds.length) throw new Error('Some release documents could not be read. Nothing was saved.')
      items.push(...batch.value.map((item) => mapAzureWorkItem(item, config)))
    }
    afterId = Math.max(...ids)
    if (items.length > 20000) throw new Error('The release query returned more than 20,000 items. Narrow the query.')
  }
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

export function releaseRegister(source: AzureWorkItem[] | undefined, backlog: AzureWorkItem[], settings: ReleaseSourceSettings = defaultReleaseSourceSettings): StreamReleases[] {
  const streams = new Map<string, Map<string, ReleaseEntry>>()
  for (const item of source ?? []) {
    const release = releaseIdentifier(item, settings)
    if (!release) continue
    const stream = streamOf(item, settings)
    const byRelease = streams.get(stream) ?? new Map<string, ReleaseEntry>()
    streams.set(stream, byRelease)
    const entry = byRelease.get(release.toLowerCase()) ?? { id: release, documents: 0, items: [], tracked: false, trackedBy: [] }
    entry.documents += 1; entry.items.push(item); byRelease.set(release.toLowerCase(), entry)
  }
  const trackedBy = (release: string) => backlog.filter((item) => ['Feature', 'User Story', 'Task'].includes(item.workItemType) && item.state.trim().toLowerCase() !== 'removed' && item.title.toLowerCase().includes(release.toLowerCase()))
  return [...streams].map(([stream, byRelease]) => {
    const releases = [...byRelease.values()].map((entry) => { const matches = trackedBy(entry.id); return { ...entry, tracked: matches.length > 0, trackedBy: matches } }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    return { stream, releases, summary: `${stream} (${releases.length}): ${releases.map((release) => release.id).join(', ')}` }
  }).sort((a, b) => (a.stream === 'Unmapped' ? 1 : 0) - (b.stream === 'Unmapped' ? 1 : 0) || b.releases.length - a.releases.length || a.stream.localeCompare(b.stream))
}
