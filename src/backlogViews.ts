import { showsInMenu, viewNameOf, type AzureConnectionProfileSummary } from './azureCredentials.ts'

// The Azure DevOps menu: every connection marked "Show in menu", named by its View name (else the connection name).
// The active Time Writing connection is the editable backlog; every other shown connection is a read-only view.
// Connections kept for backend purposes (Show in menu off) are fetched and used but not listed.
export interface BacklogView { id: string; name: string; readOnly: boolean; role: AzureConnectionProfileSummary['role'] }
type ViewProfile = Pick<AzureConnectionProfileSummary, 'id' | 'reason' | 'role' | 'viewName' | 'showInMenu'>

const activeTimeWriting = (profiles: ViewProfile[], activeId: string) => profiles.find((profile) => profile.id === activeId && profile.role === 'time-tracking') ?? profiles.find((profile) => profile.role === 'time-tracking')

// The Time Writing backlog, listed or not; pages that link to it use this name.
export function timeWritingView(profiles: ViewProfile[], activeId: string): BacklogView {
  const profile = activeTimeWriting(profiles, activeId)
  return { id: profile?.id ?? 'time-writing', name: profile ? viewNameOf(profile) : 'Backlog', readOnly: false, role: 'time-tracking' }
}

export function backlogViews(profiles: ViewProfile[], activeId: string): BacklogView[] {
  const timeWriting = activeTimeWriting(profiles, activeId)
  return [
    // Without any Time Writing connection (sample data, first start) the backlog is still listed, as "Backlog".
    ...(!timeWriting || showsInMenu(timeWriting) ? [timeWritingView(profiles, activeId)] : []),
    ...profiles.filter((profile) => profile.role !== 'time-tracking' && showsInMenu(profile)).map((profile) => ({ id: profile.id, name: viewNameOf(profile), readOnly: true, role: profile.role })),
  ]
}

const tabKey = 'demand-planning-backlog-tab-v1'
export function loadBacklogTab(storage: Pick<Storage, 'getItem'> = localStorage) { try { return storage.getItem(tabKey) ?? '' } catch { return '' } }
export function saveBacklogTab(id: string, storage: Pick<Storage, 'setItem'> = localStorage) { try { storage.setItem(tabKey, id) } catch { /* kept for this session */ } }
