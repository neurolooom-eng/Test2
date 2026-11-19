import { useState } from 'react'
import type { EpicSetupRow } from '../epicSetupRows'
import { EmptyState, Panel, Pill } from './ui'

// EPS-08 Admin → Epic & Feature setup → All Epic setups: every Epic with an Epic setup (its Feature fields) or a Feature
// setup (shared or mine), at a glance, each opening its fields or its Feature setup.
export function AllEpicSetups({ rows, onOpenFields, onOpenFeature }: { rows: EpicSetupRow[]; onOpenFields: (epicId: number) => void; onOpenFeature: (epicId: number) => void }) {
  const [find, setFind] = useState('')
  const shown = rows.filter((row) => !find.trim() || `#${row.epicId} ${row.title} ${row.fields.join(' ')} ${row.pattern}`.toLowerCase().includes(find.trim().toLowerCase()))
  return <Panel className="admin-section all-epic-setups" eyebrow="EPIC & FEATURE SETUP" title="All Epic setups" info="Every Epic with Feature fields (Epic setup) or a Feature setup (shared or yours). Fields: what New Feature and bulk creation ask for under the Epic. Feature setup: the User Stories, DoD and estimate the Feature gets.">
    <div className="query-toolbar"><input className="search" aria-label="Search Epic setups" placeholder="Search Epic, field or pattern" value={find} onChange={(event) => setFind(event.target.value)} /><small className="muted">{shown.length} of {rows.length}</small></div>
    {rows.length ? <div className="azure-table"><table className="epic-setups-table"><thead><tr><th>Epic</th><th>Feature fields (Epic setup)</th><th>Title pattern</th><th>Feature setup</th><th /></tr></thead><tbody>{shown.map((row) => <tr key={row.epicId}>
      <td><strong>#{row.epicId}</strong> {row.title}</td>
      <td>{row.fields.length ? row.fields.join(', ') : <span className="muted">None</span>}</td>
      <td>{row.pattern ? <code>{row.pattern}</code> : <span className="muted">—</span>}</td>
      <td>{row.shared || row.mine ? <>{row.shared && <Pill tone="info">Shared</Pill>}{row.mine && <Pill tone="open">Mine</Pill>}<small className="muted"> {row.stories} User Stor{row.stories === 1 ? 'y' : 'ies'}{row.dod ? ` · DoD “${row.dod.length > 60 ? `${row.dod.slice(0, 60)}…` : row.dod}”` : ''}</small></> : <span className="muted">None (built-in milestones)</span>}</td>
      <td className="nowrap"><button type="button" className="ghost" onClick={() => onOpenFields(row.epicId)}>Fields</button><button type="button" className="ghost" onClick={() => onOpenFeature(row.epicId)}>Feature setup</button></td>
    </tr>)}</tbody></table></div> : <EmptyState title="No Epic setups yet." detail="Add Feature fields to an Epic (Feature fields per Epic) or a Feature setup (Feature setup)." />}
  </Panel>
}
