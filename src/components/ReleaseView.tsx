import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { releaseRegister } from '../releaseSource'
import { formatDate, formatHours } from '../format'
import { QueryView } from './QueryView'
import { EmptyState, Pill, TablePanel } from './ui'
import type { QueryColumn, QueryOrder } from '../queryView'
import { useColumnWidths } from './columnWidths'

// Release source view, one page: the releases found in the documents' paths (see releasePath: release from the
// Iteration Path with the name from the Area Path, else "…\Name\Release x.y.z" in the Area Path) as a flat list — no grouping by stream — and below it the documents with the query's columns.
export function ReleaseView({ name, items, backlog, columns, orderBy, unresolved }: { name: string; items: AzureWorkItem[]; backlog: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[] }) {
  const [open, setOpen] = useState('')
  const register = releaseRegister(items, backlog)
  const widths = useColumnWidths(`releases:${name}`)
  const headings = ['Name', 'Release', 'Approved', 'Documents', 'Time Writing', 'Planned (h)', 'Booked (h)']
  return <>
    <TablePanel title="Releases" detail="Release from the segment “Release x.y.z” of each document's Iteration Path, with the name from its Area Path (last segment); without a release in the Iteration Path, both from the Area Path (“…\Name\Release x.y.z”). Tracked = a Feature, User Story or Task in the Time Writing backlog names both. Planned and booked = Original Estimate and Completed Work, all months, on the Time Writing Tasks under those Features." count={`${register.length} releases`}>
      {register.length ? <table className="release-register resizable"><thead><tr>{headings.map((heading) => <th key={heading} style={widths.style(heading)}>{heading}{widths.handle(heading)}</th>)}</tr></thead><tbody>
        {register.flatMap((release) => [
          <tr key={release.key}>
            <td><button type="button" className="text-button" aria-expanded={open === release.key} onClick={() => setOpen(open === release.key ? '' : release.key)}>{open === release.key ? '▾' : '▸'} {release.name}</button></td>
            <td>{release.release}</td><td>{release.approvalDate ? formatDate(release.approvalDate) : '—'}</td><td>{release.documents}</td>
            <td>{release.tracked ? <Pill tone="open">Tracked · {release.trackedBy.length}</Pill> : <Pill tone="warning">Not tracked</Pill>}</td>
            <td>{release.hourTasks ? formatHours(release.planned) : '—'}</td>
            <td>{release.hourTasks ? <>{formatHours(release.booked)}{release.planned > 0 && release.booked > release.planned && <small className="negative">+{formatHours(release.booked - release.planned)} over plan</small>}</> : '—'}<small>{release.hourTasks ? `${release.hourTasks} task${release.hourTasks === 1 ? '' : 's'}` : ''}</small></td>
          </tr>,
          ...(open === release.key ? [<tr key={`${release.key}/docs`} className="release-docs"><td colSpan={7}><ul>{release.items.map((item) => <li key={item.key}><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a><small> · {item.state}{item.approvalDate ? ` · approved ${formatDate(item.approvalDate)}` : ''}</small></li>)}</ul></td></tr>] : []),
        ])}
      </tbody></table> : <EmptyState title="No releases found in the documents' paths." detail="A release is read from a path segment “Release x.y.z”, with the name in the segment above it." />}
    </TablePanel>
    <QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={unresolved} />
  </>
}
