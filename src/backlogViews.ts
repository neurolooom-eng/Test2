import type { AzureConnectionProfileSummary } from './azureCredentials.ts'

// Tabs on the Backlogs page: the active Time Writing backlog first (read & write), then every "Backlog view"
// connection in the order they were added (read only). Tab names are the connection names.
export interface BacklogView { id: string; name: string; readOnly: boolean }
export function backlogViews(profiles: Pick<AzureConnectionProfileSummary, 'id' | 'reason' | 'role'>[], activeId: string): BacklogView[] {
  const timeWriting = profiles.find((profile) => profile.id === activeId && profile.role === 'time-tracking') ?? profiles.find((profile) => profile.role === 'time-tracking')
  return [{ id: timeWriting?.id ?? 'time-writing', name: timeWriting?.reason || 'Backlog', readOnly: false }, ...profiles.filter((profile) => profile.role === 'backlog-view').map((profile) => ({ id: profile.id, name: profile.reason, readOnly: true }))]
}

const tabKey = 'demand-planning-backlog-tab-v1'
export function loadBacklogTab(storage: Pick<Storage, 'getItem'> = localStorage) { try { return storage.getItem(tabKey) ?? '' } catch { return '' } }
export function saveBacklogTab(id: string, storage: Pick<Storage, 'setItem'> = localStorage) { try { storage.setItem(tabKey, id) } catch { /* kept for this session */ } }
