import type { AzureWorkItem } from './domain'
import { tracksRelease } from './releaseSource.ts'

// DP releases combine two data sets: the DHFI documents of DP [Completed Releases] (release name from the Area Path,
// number from the Iteration Path) and the Release work items of the DHP release register (Pedestal). A Pedestal
// Release belongs to a DHFI release when its Title names both the release name and its version (the exact version
// rule of tracksRelease: 2.1 = 2.1.0, extra words allowed). Only releases with DHFI documents are listed.

// The Pedestal fields shown, by their name in the query; the reference name may carry any prefix (Custom., Philips., …).
export const pedestalFields = ['SourceProgram', 'PsName', 'Release', 'ReleaseIntent', 'Year', 'PI', 'VerificationDeviation', 'IsDesignReview', 'DRPEDate', 'DRPEStatus', 'DRPCDate', 'DRPCStatus', 'DRfHDate', 'DRfHStatus', 'DDTDate', 'DDTStatus'] as const
export type PedestalField = typeof pedestalFields[number]
export const designReviews = [['DRPE', 'DRPEDate', 'DRPEStatus'], ['DRPC', 'DRPCDate', 'DRPCStatus'], ['DRfH', 'DRfHDate', 'DRfHStatus'], ['DDT', 'DDTDate', 'DDTStatus']] as const

export function fieldOf(item: Pick<AzureWorkItem, 'fields'>, name: string) {
  const fields = item.fields ?? {}
  const wanted = name.toLowerCase()
  const key = Object.keys(fields).find((ref) => ref.toLowerCase() === wanted || ref.toLowerCase().endsWith(`.${wanted}`))
  const value = key ? fields[key] : undefined
  return value == null || value === '' ? undefined : String(value)
}

export interface PedestalRelease { item: AzureWorkItem; values: Partial<Record<PedestalField, string>> }
export const isPedestalRelease = (item: AzureWorkItem) => item.workItemType.trim().toLowerCase() === 'release' && item.state.trim().toLowerCase() !== 'removed'
export function pedestalRelease(item: AzureWorkItem): PedestalRelease {
  return { item, values: Object.fromEntries(pedestalFields.flatMap((name) => { const value = fieldOf(item, name); return value ? [[name, value]] : [] })) }
}

// The Pedestal Releases whose Title names the DHFI release (name and version); the newest (highest ID) first.
export function pedestalFor(name: string, release: string, pedestal: AzureWorkItem[]) {
  return pedestal.filter((item) => isPedestalRelease(item) && tracksRelease(item.title, name, release)).sort((a, b) => b.id - a.id).map(pedestalRelease)
}

// The Pedestal Release work items among the fetched views (the DHP release register, a reference connection), except
// the view itself; each work item once. The query names its columns by display name ([PI], [DRPEDate], …): each value is
// also kept under its column's name, so it is found whatever reference name Azure DevOps gives the field.
export function pedestalItems(sources: { connectionId: string; items: AzureWorkItem[]; columns?: { ref: string; name: string }[] }[] | undefined, except?: string) {
  const seen = new Set<string>()
  return (sources ?? []).filter((source) => source.connectionId !== except).flatMap((source) => source.items.filter((item) => isPedestalRelease(item) && !seen.has(item.key) && seen.add(item.key)).map((item) => {
    const named = (source.columns ?? []).flatMap(({ ref, name }) => name && name !== ref && item.fields?.[ref] != null ? [[name, item.fields[ref]]] : [])
    return named.length ? { ...item, fields: { ...Object.fromEntries(named), ...item.fields } } : item
  }))
}
