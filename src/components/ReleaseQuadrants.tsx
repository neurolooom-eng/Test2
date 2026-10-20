import { formatDate, formatDateTime, monthName } from '../format'
import type { ReleaseStream } from '../releaseOverview'
import { Panel } from './ui'

// Overview 2x2: one quadrant per release stream (its releases in the month with document counts) and a last quadrant
// with the totals across streams.
export function ReleaseQuadrants({ streams, month }: { streams: ReleaseStream[]; month: string }) {
  const releases = streams.reduce((sum, stream) => sum + stream.releases.length, 0)
  const documents = streams.reduce((sum, stream) => sum + stream.documents, 0)
  return <section className="release-quadrants" aria-label={`Releases in ${monthName(month)}`}>
    {streams.map((stream) => <Panel key={stream.id} className="release-quadrant" eyebrow="RELEASES" title={stream.name} detail={`${stream.releases.length} release${stream.releases.length === 1 ? '' : 's'} · ${stream.documents} document${stream.documents === 1 ? '' : 's'} in ${monthName(month)} · data fetched ${formatDateTime(stream.fetchedAt)}`}>
      {stream.releases.length ? <table><thead><tr><th>Name</th><th>Release</th><th>Documents</th><th>Approved</th></tr></thead><tbody>{stream.releases.map((entry) => <tr key={`${entry.name}/${entry.release}`}><td>{entry.name}</td><td>{entry.release}</td><td>{entry.documents}</td><td>{formatDate(entry.approvalDate)}</td></tr>)}</tbody></table> : <p className="muted">No releases in {monthName(month)}.</p>}
    </Panel>)}
    <Panel className="release-quadrant release-quadrant-total" eyebrow="ALL STREAMS" title={`${releases} release${releases === 1 ? '' : 's'} · ${documents} document${documents === 1 ? '' : 's'}`} detail={`${monthName(month)}, per stream. Month by approval date (else changed date) in your time zone.`}>
      <table><thead><tr><th>Stream</th><th>Releases</th><th>Documents</th></tr></thead><tbody>{streams.map((stream) => <tr key={stream.id}><td>{stream.name}</td><td>{stream.releases.length}</td><td>{stream.documents}</td></tr>)}<tr className="matrix-total"><td>Total</td><td>{releases}</td><td>{documents}</td></tr></tbody></table>
    </Panel>
  </section>
}
