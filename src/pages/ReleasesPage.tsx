import { useState } from 'react'
import { EmptyState, Metric, Metrics, Page, Panel, Pill, TablePanel } from '../components/ui'
import { azureInsights, indiaMonth } from '../azureInsights'
import { completedReleases, normalizeReleaseSourceSettings, releaseRegister } from '../releaseSource'
import { formatDate, formatDateTime, monthName, todayIso } from '../format'
import type { ReleaseMilestone } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { PageProps } from './types'

const milestones: ReleaseMilestone[] = ['PRD', 'SFV', 'DT', 'PR', 'Design Review']

export function ReleasesPage({ azure, month, store }: { azure: AzureWorkspace; month: string; store: PageProps['store'] }) {
  const [today] = useState(todayIso)
  const data = azureInsights(azure.items, month, today)
  const features = data.features.filter(item => indiaMonth(item.closedDate) === month || item.targetDate?.startsWith(month))
  const overdue = data.overdue.filter(item => item.workItemType === 'Feature').length
  const source = store.state.releaseSource
  const register = releaseRegister(source?.items, azure.items, normalizeReleaseSourceSettings(store.state.releaseSourceSettings))
  const completed = completedReleases(register, month)
  const releaseCount = register.reduce((sum, stream) => sum + stream.releases.length, 0)
  const untracked = register.reduce((sum, stream) => sum + stream.releases.filter((release) => !release.tracked).length, 0)
  const plans = store.state.releasePlans ?? []
  return <Page>
    <Metrics>
      <Metric label="Completed releases" value={source ? completed.length : '—'} hint={source ? `Author Approval Date in ${monthName(month)}` : 'Fetch the release source under Azure DevOps'} tone={completed.length ? 'positive' : undefined} />
      <Metric label="Approved releases" value={source ? releaseCount : '—'} hint={source ? `${register.length} stream${register.length === 1 ? '' : 's'} · ${untracked} without Time Writing items` : 'All releases in the read-only source'} tone={untracked ? 'negative' : undefined} />
      <Metric label="Features" value={features.length} hint={`Targeted or closed in ${monthName(month)} · ${data.closures.length} closed`} />
      <Metric label="Overdue" value={overdue} hint="Open Features with an elapsed target date" tone={overdue ? 'negative' : undefined} />
    </Metrics>
    <div className="dashboard-grid">
      <TablePanel title={`Completed releases · ${monthName(month)}`} detail="Releases in the read-only source whose Author Approval Date falls in the selected month." count={`${completed.length} releases`} empty={completed.length ? undefined : source ? `No release was approved in ${monthName(month)}.` : 'No release source fetched yet.'}>
        <table><thead><tr><th>Release</th><th>Name</th><th>Stream</th><th>Approved</th><th>Time Writing</th></tr></thead><tbody>{completed.map((release) => <tr key={`${release.stream}/${release.id}`}><td><strong>{release.id}</strong></td><td>{release.items[0] ? <a href={release.items[0].url} target="_blank" rel="noreferrer">{release.name}</a> : release.name}</td><td>{release.stream}</td><td>{formatDate(release.approvalDate)}</td><td>{release.tracked ? <Pill tone="open">{release.trackedBy.length} item{release.trackedBy.length === 1 ? '' : 's'}</Pill> : <Pill tone="warning">Not in Time Writing</Pill>}</td></tr>)}</tbody></table>
      </TablePanel>
      <Panel eyebrow="READ-ONLY RELEASE SOURCE" title="Approved releases by stream" detail={source ? `${source.items.length} approved documents from ${source.organization}/${source.project}, fetched ${formatDateTime(source.fetchedAt)}.` : 'Releases are read from a second, read-only Azure project. Configure it under Azure DevOps → Release source.'}>
        {register.length ? <ul className="release-summary">{register.map((stream) => <li key={stream.stream}><strong>{stream.stream}</strong> ({stream.releases.length}): {stream.releases.map((release, index) => <span key={release.id}>{index > 0 && ', '}<span className={release.tracked ? 'release-tracked' : 'release-untracked'} title={release.tracked ? `Time Writing items: ${release.trackedBy.map((item) => `#${item.id}`).join(', ')}` : 'No Feature, User Story or Task in the Time Writing backlog mentions this release'}>{release.id}</span></span>)}</li>)}</ul> : <EmptyState title={source ? 'No release identifiers found.' : 'No release source fetched yet.'} detail={source ? 'None of the fetched documents has an Area Path below the project level.' : 'Save a read-only ADS configuration and run the release query under Azure DevOps.'} />}
        {register.length > 0 && <p className="muted">Underlined releases have no Feature, User Story or Task in the Time Writing backlog. Release = last Area Path segment; stream = the segment above it.</p>}
      </Panel>
    </div>
    {register.length > 0 && <TablePanel title="All approved releases" count={`${releaseCount} releases`}>
      <table><thead><tr><th>Stream</th><th>Release</th><th>Name</th><th>Documents</th><th>Approved</th><th>Time Writing</th></tr></thead><tbody>{register.flatMap((stream) => stream.releases.map((release) => <tr key={`${stream.stream}/${release.id}`}><td>{stream.stream}</td><td><strong>{release.id}</strong></td><td>{release.items[0] ? <a href={release.items[0].url} target="_blank" rel="noreferrer">{release.name}</a> : release.name}{release.documents > 1 && <small>+{release.documents - 1} more document{release.documents > 2 ? 's' : ''}</small>}</td><td>{release.documents}</td><td>{formatDate(release.approvalDate)}{release.approvalMonth === month && <small>this month</small>}</td><td>{release.tracked ? <Pill tone="open">{release.trackedBy.length} item{release.trackedBy.length === 1 ? '' : 's'}</Pill> : <Pill tone="warning">No items</Pill>}</td></tr>))}</tbody></table>
    </TablePanel>}
    <TablePanel eyebrow="RELEASE PLANNING" title="Release plan" detail="Source, program and milestone dates per release (TFS / Windchill / manual). Backlog integration is planned; records are shown as loaded." count={`${plans.length} releases`} empty={plans.length ? undefined : 'No release plans loaded.'}>
      <div className="azure-table"><table><thead><tr><th>Source</th><th>Program</th><th>Title</th><th>Type</th>{milestones.map((milestone) => <th key={milestone}>{milestone}</th>)}</tr></thead><tbody>{plans.map((plan) => <tr key={plan.id}><td>{plan.source}</td><td>{plan.program}</td><td><strong>{plan.title}</strong>{plan.sample && <small>sample</small>}</td><td><Pill tone={plan.type === 'Release' ? 'info' : 'neutral'}>{plan.type}</Pill></td>{milestones.map((milestone) => <td key={milestone} className={plan.milestones[milestone]?.startsWith(month) ? 'milestone-month' : ''}>{formatDate(plan.milestones[milestone])}</td>)}</tr>)}</tbody></table></div>
    </TablePanel>
    <TablePanel title="Features" count={`${features.length} features`} empty={features.length ? undefined : `No Feature dates match ${monthName(month)}.`}>
      <table><thead><tr><th>Feature</th><th>State</th><th>Assigned to</th><th>Target date</th><th>Closed date</th><th>Iteration</th></tr></thead><tbody>{features.map(item => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a></td><td><Pill tone="info">{item.state}</Pill></td><td>{item.assignedTo || 'Unassigned'}</td><td>{formatDate(item.targetDate)}</td><td>{formatDate(item.closedDate)}</td><td>{item.iterationPath || '—'}</td></tr>)}</tbody></table>
    </TablePanel>
  </Page>
}
