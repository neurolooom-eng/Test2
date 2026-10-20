import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { releaseOf } from './releasePath.ts'
import { releaseRegister, viewMonthOf } from './releaseSource.ts'
import { viewSource } from './viewSources.ts'

// Overview "Releases this month": for each read-only view whose documents carry releases in their paths (DP, CP,
// IOCC, …), the releases with documents approved (else changed) in the month, in the viewer's time zone — the same
// month rule as the views — with the document count; plus the totals across streams.
export interface StreamRelease { name: string; release: string; documents: number; approvalDate?: string }
export interface ReleaseStream { id: string; name: string; fetchedAt: string; releases: StreamRelease[]; documents: number }

export function releaseStreams(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string): ReleaseStream[] {
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  const streams: ReleaseStream[] = []
  for (const profile of profiles) {
    if (profile.role === 'time-tracking') continue
    const source = viewSource(state, profile.id, profile.role, profile.query, releaseConnections)
    if (!source || !source.items.some((item) => releaseOf(item))) continue
    const inMonth = source.items.filter((item) => viewMonthOf(item, timeZone) === month)
    const releases = releaseRegister(inMonth, []).map(({ name, release, documents, approvalDate }) => ({ name, release, documents, ...(approvalDate ? { approvalDate } : {}) }))
    streams.push({ id: profile.id, name: profile.viewName || profile.reason, fetchedAt: source.fetchedAt, releases, documents: releases.reduce((sum, entry) => sum + entry.documents, 0) })
  }
  return streams.sort((a, b) => a.name.localeCompare(b.name))
}
