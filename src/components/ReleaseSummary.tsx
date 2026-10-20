import { monthName } from '../format'
import type { ReleaseStream } from '../releaseOverview'
import { Panel } from './ui'

// Top of Overview: the month's releases per stream, one line each — "CP [2] : Care Pathways 3.1, Care Pathways 3.2".
export function ReleaseSummary({ streams, month }: { streams: ReleaseStream[]; month: string }) {
  const total = streams.reduce((sum, stream) => sum + stream.releases.length, 0)
  return <Panel className="release-summary" eyebrow="RELEASES" title={`${monthName(month)} · ${total} release${total === 1 ? '' : 's'}`} detail="Releases with documents approved in the month (Author Approval Date in your time zone), per release view.">
    <ul>{streams.map((stream) => <li key={stream.id}><strong>{stream.name} [{stream.releases.length}]</strong> : {stream.releases.length ? stream.releases.map((entry) => `${entry.name} ${entry.release}`).join(', ') : <span className="muted">—</span>}</li>)}</ul>
  </Panel>
}
