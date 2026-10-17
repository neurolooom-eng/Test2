import { useState } from 'react'
import { EmptyState, Metric, Metrics, Page, Panel, Pill, TablePanel } from '../components/ui'
import { AzureSourceBar } from '../components/AzureSourceBar'
import { azureInsights, indiaMonth } from '../azureInsights'
import { normalizeReleaseSourceSettings, releaseRegister } from '../releaseSource'
import { formatDate, formatDateTime, monthName, todayIso } from '../format'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { PageProps } from './types'

export function ReleasesPage({ azure, month, store, onOpenConnection }: { azure: AzureWorkspace; month: string; store: PageProps['store']; onOpenConnection: () => void }) {
  const [today] = useState(todayIso)
  const data = azureInsights(azure.items, month, today)
  const features = data.features.filter(item => indiaMonth(item.closedDate) === month || item.targetDate?.startsWith(month))
  const overdue = data.overdue.filter(item => item.workItemType === 'Feature').length
  const source = store.state.releaseSource
  const register = releaseRegister(source?.items, azure.items, normalizeReleaseSourceSettings(store.state.releaseSourceSettings))
  const releaseCount = register.reduce((sum, stream) => sum + stream.releases.length, 0)
  const untracked = register.reduce((sum, stream) => sum + stream.releases.filter((release) => !release.tracked).length, 0)
  return <Page>
    <AzureSourceBar azure={azure} onOpenConnection={onOpenConnection} />
    <Metrics>
      <Metric label="Features" value={features.length} hint={`Targeted or closed in ${monthName(month)}`} />
      <Metric label="Closed" value={data.closures.length} hint="Closed/Done/Completed this month" />
      <Metric label="Overdue" value={overdue} hint="Open Features with an elapsed target date" tone={overdue ? 'negative' : undefined} />
      <Metric label="Approved releases" value={source ? releaseCount : '—'} hint={source ? `${register.length} stream${register.length === 1 ? '' : 's'} · ${untracked} without Time Writing items` : 'Fetch the release source under Azure DevOps'} tone={untracked ? 'negative' : undefined} />
    </Metrics>
    <Panel eyebrow="READ-ONLY RELEASE SOURCE" title="Approved releases by stream" detail={source ? `${source.items.length} approved documents from ${source.organization}/${source.project}, fetched ${formatDateTime(source.fetchedAt)}. Release = last Area Path segment; stream = the segment above it.` : 'Releases are read from a second, read-only Azure project. Configure it under Azure DevOps → Release source.'}>
      {register.length ? <>
        <ul className="release-summary">{register.map((stream) => <li key={stream.stream}><strong>{stream.stream}</strong> ({stream.releases.length}): {stream.releases.map((release, index) => <span key={release.id}>{index > 0 && ', '}<span className={release.tracked ? 'release-tracked' : 'release-untracked'} title={release.tracked ? `Time Writing items: ${release.trackedBy.map((item) => `#${item.id}`).join(', ')}` : 'No Feature, User Story or Task in the time-tracking backlog mentions this release'}>{release.id}</span></span>)}</li>)}</ul>
        <div className="azure-table"><table><thead><tr><th>Stream</th><th>Release</th><th>Approved documents</th><th>Time Writing</th></tr></thead><tbody>{register.flatMap((stream) => stream.releases.map((release) => <tr key={`${stream.stream}/${release.id}`}><td>{stream.stream}</td><td><strong>{release.id}</strong></td><td>{release.documents}{release.items[0] && <small><a href={release.items[0].url} target="_blank" rel="noreferrer">#{release.items[0].id} {release.items[0].title}</a>{release.documents > 1 ? ` +${release.documents - 1} more` : ''}</small>}</td><td>{release.tracked ? <Pill tone="open">{release.trackedBy.length} item{release.trackedBy.length === 1 ? '' : 's'}</Pill> : <Pill tone="warning">No items</Pill>}</td></tr>))}</tbody></table></div>
      </> : <EmptyState title={source ? 'No release identifiers found.' : 'No release source fetched yet.'} detail={source ? 'None of the fetched documents has an Area Path below the project level.' : 'Save a read-only ADS configuration and run the release query under Azure DevOps.'} />}
    </Panel>
    <TablePanel title="Features" count={`${features.length} features`} empty={features.length ? undefined : `No Feature dates match ${monthName(month)}.`}>
      <table><thead><tr><th>Feature</th><th>State</th><th>Assigned to</th><th>Target date</th><th>Closed date</th><th>Iteration</th></tr></thead><tbody>{features.map(item => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a></td><td><Pill tone="info">{item.state}</Pill></td><td>{item.assignedTo || 'Unassigned'}</td><td>{formatDate(item.targetDate)}</td><td>{formatDate(item.closedDate)}</td><td>{item.iterationPath || '—'}</td></tr>)}</tbody></table>
    </TablePanel>
  </Page>
}
