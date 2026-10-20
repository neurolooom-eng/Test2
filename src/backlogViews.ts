import type { AzureConnectionProfileSummary } from './azureCredentials.ts'

// The Azure DevOps views, shown in the sidebar and as tabs on the backlog page. The first is the active Time Writing
// backlog (read & write), named QMS-0025 unless renamed in Settings. The others are read-only "Backlog view" connections matched by name; a view without a
// connection yet is still listed and offers to set it up. Further backlog-view connections are added after them.
export const standardViews = ['Digital Platform', 'Clinical Platform', 'Serviceability', 'IOCC']
export const defaultTimeWritingViewName = 'QMS-0025'
export interface BacklogView { id: string; name: string; readOnly: boolean; configured: boolean }
export const placeholderId = (name: string) => `setup:${name}`

export function backlogViews(profiles: Pick<AzureConnectionProfileSummary, 'id' | 'reason' | 'role'>[], activeId: string, timeWritingName?: string): BacklogView[] {
  const timeWriting = profiles.find((profile) => profile.id === activeId && profile.role === 'time-tracking') ?? profiles.find((profile) => profile.role === 'time-tracking')
  const views = profiles.filter((profile) => profile.role === 'backlog-view')
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const standard = standardViews.map((name): BacklogView => {
    const profile = views.find((view) => same(view.reason, name))
    return profile ? { id: profile.id, name, readOnly: true, configured: true } : { id: placeholderId(name), name, readOnly: true, configured: false }
  })
  const extra = views.filter((view) => !standardViews.some((name) => same(view.reason, name))).map((view) => ({ id: view.id, name: view.reason, readOnly: true, configured: true }))
  return [{ id: timeWriting?.id ?? 'time-writing', name: timeWritingName?.trim() || defaultTimeWritingViewName, readOnly: false, configured: Boolean(timeWriting) }, ...standard, ...extra]
}

const tabKey = 'demand-planning-backlog-tab-v1'
export function loadBacklogTab(storage: Pick<Storage, 'getItem'> = localStorage) { try { return storage.getItem(tabKey) ?? '' } catch { return '' } }
export function saveBacklogTab(id: string, storage: Pick<Storage, 'setItem'> = localStorage) { try { storage.setItem(tabKey, id) } catch { /* kept for this session */ } }
