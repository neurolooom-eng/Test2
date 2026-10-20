import type { AzureConnectionProfileSummary } from './azureCredentials.ts'

// The Azure DevOps views, shown in the sidebar and as tabs on the backlog page. The first is the active Time Writing
// backlog (read & write), named QMS-0025 unless renamed in Settings. Then every connection saved as "Backlog view"
// (read only), in the order added: a view appears only once it is configured.
export const defaultTimeWritingViewName = 'QMS-0025'
export interface BacklogView { id: string; name: string; readOnly: boolean }

export function backlogViews(profiles: Pick<AzureConnectionProfileSummary, 'id' | 'reason' | 'role'>[], activeId: string, timeWritingName?: string): BacklogView[] {
  const timeWriting = profiles.find((profile) => profile.id === activeId && profile.role === 'time-tracking') ?? profiles.find((profile) => profile.role === 'time-tracking')
  return [{ id: timeWriting?.id ?? 'time-writing', name: timeWritingName?.trim() || defaultTimeWritingViewName, readOnly: false }, ...profiles.filter((profile) => profile.role === 'backlog-view').map((profile) => ({ id: profile.id, name: profile.reason, readOnly: true }))]
}

const tabKey = 'demand-planning-backlog-tab-v1'
export function loadBacklogTab(storage: Pick<Storage, 'getItem'> = localStorage) { try { return storage.getItem(tabKey) ?? '' } catch { return '' } }
export function saveBacklogTab(id: string, storage: Pick<Storage, 'setItem'> = localStorage) { try { storage.setItem(tabKey, id) } catch { /* kept for this session */ } }
