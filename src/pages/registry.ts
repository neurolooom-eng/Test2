// Single source for navigation labels, header text and grouping so the sidebar and page header always agree.
export type Page = 'overview' | 'mywork' | 'monthly' | 'baselines' | 'releases' | 'board' | 'snapshots' | 'admin'
export type PageGroup = 'Overview' | 'My Work' | 'Azure DevOps' | 'Data & governance'

export interface PageMeta { id: Page; label: string; icon: string; group: PageGroup; detail: string; usesMonth: boolean }

export const pages: PageMeta[] = [
  { id: 'overview', label: 'Overview', icon: '▦', group: 'Overview', detail: 'Plan, actuals, absence and utilization for the selected month from the saved Azure backlog.', usesMonth: true },
  { id: 'mywork', label: 'Assigned to Me', icon: '◉', group: 'My Work', detail: 'Your pending Azure DevOps items, with finishing, moving to the current Sprint and month Time Writing tasks.', usesMonth: false },
  { id: 'monthly', label: 'Monthly Time Writing', icon: '◫', group: 'My Work', detail: 'Selected-month Tasks are the source for Azure Original Estimate and Completed Work.', usesMonth: true },
  { id: 'baselines', label: 'Baselines', icon: '⌁', group: 'Data & governance', detail: 'Release baselines from estimation rules and scope, against booked hours; plus the monthly task plan check.', usesMonth: true },
  { id: 'releases', label: 'Feature milestones', icon: '◆', group: 'Data & governance', detail: 'Feature dates and states from the same Azure backlog source.', usesMonth: true },
  { id: 'board', label: 'Backlogs', icon: '▤', group: 'Azure DevOps', detail: 'Plan and track the team’s work in an expandable Epic → Feature → User Story → Task backlog.', usesMonth: false },
  { id: 'snapshots', label: 'Snapshots', icon: '▣', group: 'Data & governance', detail: 'Save point-in-time app data to SharePoint for LTE and PI Review; manage browser backups.', usesMonth: true },
  { id: 'admin', label: 'Settings', icon: '⚙', group: 'Data & governance', detail: 'Azure DevOps connections, Git and SharePoint storage, capacity, periods, resources, master data and audit.', usesMonth: true },
]

export const pageGroups: PageGroup[] = ['Overview', 'My Work', 'Azure DevOps', 'Data & governance']
export const pageMeta = (id: Page) => pages.find((page) => page.id === id)!
