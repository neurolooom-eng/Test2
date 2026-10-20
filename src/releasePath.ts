import type { AzureWorkItem } from './domain'

// Release information read from a work item's paths: a segment "Release x.y.z" gives the release, and the segment
// above it gives the name, e.g. "DHP\DoseNav\Release 2.1.0\Sprint 4" → DoseNav, 2.1.0. The Area Path is used first;
// when it carries no release, the Iteration Path. Used by the read-only Azure DevOps views, not the QMS-0025 backlog.
export interface PathRelease { name: string; release: string }
const releaseSegment = /^release\s*[-_:]?\s*v?(\d+(?:\.\d+)*[\w.-]*)$/i

export function releaseFromPath(path?: string): PathRelease | undefined {
  const parts = (path ?? '').split('\\').map((part) => part.trim()).filter(Boolean)
  for (let index = 1; index < parts.length; index += 1) {
    const match = releaseSegment.exec(parts[index])
    if (match) return { name: parts[index - 1], release: match[1] }
  }
  return undefined
}

export const releaseOf = (item: Pick<AzureWorkItem, 'areaPath' | 'iterationPath'>) => releaseFromPath(item.areaPath) ?? releaseFromPath(item.iterationPath)
