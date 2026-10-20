// Single source for navigation labels, header text and grouping so the sidebar and page header always agree.
export type Page = 'overview' | 'mywork' | 'activities' | 'monthly' | 'baselines' | 'releases' | 'board' | 'azure' | 'migration' | 'snapshots' | 'admin'
export type PageGroup = 'Overview' | 'Time writing' | 'Azure DevOps' | 'Data & governance'

export interface PageMeta { id: Page; label: string; icon: string; group: PageGroup; detail: string; usesMonth: boolean }

export const pages: PageMeta[] = [
  { id: 'overview', label: 'Overview', icon: '▦', group: 'Overview', detail: 'Plan, actuals, absence and utilization for the selected month from the saved Azure backlog.', usesMonth: true },
  { id: 'mywork', label: 'My work', icon: '◉', group: 'Overview', detail: 'Your pending Azure DevOps items, with finishing, moving to the current Sprint and month Time Writing tasks.', usesMonth: false },
  { id: 'monthly', label: 'Monthly Time Writing', icon: '◫', group: 'Time writing', detail: 'Selected-month Tasks are the source for Azure Original Estimate and Completed Work.', usesMonth: true },
  { id: 'baselines', label: 'Baselines', icon: '⌁', group: 'Time writing', detail: 'Release baselines from estimation rules and scope, against booked hours; plus the monthly task plan check.', usesMonth: true },
  { id: 'releases', label: 'Feature milestones', icon: '◆', group: 'Time writing', detail: 'Feature dates and states from the same Azure backlog source.', usesMonth: true },
  { id: 'activities', label: 'Work items', icon: '✓', group: 'Time writing', detail: 'The selected-team backlog used across the application.', usesMonth: false },
  { id: 'board', label: 'Backlogs', icon: '▤', group: 'Azure DevOps', detail: 'Plan and track the team’s work in an expandable Epic → Feature → User Story → Task backlog.', usesMonth: false },
  { id: 'azure', label: 'Azure DevOps', icon: '⇄', group: 'Azure DevOps', detail: 'Configure the connection, save ADS configurations and fetch data.', usesMonth: false },
  { id: 'migration', label: 'Migration', icon: '⇧', group: 'Data & governance', detail: 'Load the TransformedData tab from the demand-planning Excel workbook or its CSV export.', usesMonth: false },
  { id: 'snapshots', label: 'Snapshots', icon: '▣', group: 'Data & governance', detail: 'Save point-in-time app data to SharePoint for LTE and PI Review; manage browser backups.', usesMonth: true },
  { id: 'admin', label: 'Administration', icon: '⚙', group: 'Data & governance', detail: 'Periods, capacity settings, resources from Azure, masters, SharePoint connection and audit evidence.', usesMonth: true },
]

export const pageGroups: PageGroup[] = ['Overview', 'Time writing', 'Azure DevOps', 'Data & governance']
export const pageMeta = (id: Page) => pages.find((page) => page.id === id)!
