import { useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { releaseRegister, type ReleaseSourceSettings } from '../releaseSource'
import { formatDate } from '../format'
import { QueryView } from './QueryView'
import { EmptyState, Pill } from './ui'
import type { QueryColumn, QueryOrder } from '../queryView'

// Release source view: Register (stream → release, from the Area Path; approval date, documents, whether the release
// has Time Writing items) and Documents (the query's own columns). The selected tab is remembered in this browser.
const tabKey = 'demand-planning-release-tab-v1'
export function ReleaseView({ name, items, backlog, settings, columns, orderBy }: { name: string; items: AzureWorkItem[]; backlog: AzureWorkItem[]; settings: ReleaseSourceSettings; columns?: QueryColumn[]; orderBy?: QueryOrder[] }) {
  const [tab, setTabState] = useState<'register' | 'documents'>(() => { try { return localStorage.getItem(tabKey) === 'documents' ? 'documents' : 'register' } catch { return 'register' } })
  const setTab = (next: 'register' | 'documents') => { setTabState(next); try { localStorage.setItem(tabKey, next) } catch { /* convenience only */ } }
  const [open, setOpen] = useState('')
  const register = releaseRegister(items, backlog, settings)
  const releases = register.reduce((sum, stream) => sum + stream.releases.length, 0)
  return <>
    <div className="overview-tabs" role="tablist" aria-label={`${name} sections`}>{([['register', `Register · ${releases} releases`], ['documents', `Documents · ${items.length}`]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`backlog-tab ${tab === key ? 'backlog-tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'documents' ? <QueryView name={name} items={items} columns={columns} orderBy={orderBy} />
      : register.length ? <div className="azure-table release-register"><table><thead><tr><th>Stream</th><th>Release</th><th>Name</th><th>Approved</th><th>Documents</th><th>Time Writing</th></tr></thead><tbody>
        {register.flatMap((stream) => stream.releases.map((release, index) => { const key = `${stream.stream}/${release.id}`; return [
          <tr key={key}><td>{index === 0 && <><strong>{stream.stream}</strong><small>{stream.releases.length} releases</small></>}</td>
            <td><button type="button" className="text-button" aria-expanded={open === key} onClick={() => setOpen(open === key ? '' : key)}>{open === key ? '▾' : '▸'} {release.id}</button></td>
            <td>{release.name}</td><td>{release.approvalDate ? formatDate(release.approvalDate) : '—'}</td><td>{release.documents}</td>
            <td>{release.tracked ? <Pill tone="open">Tracked · {release.trackedBy.length}</Pill> : <Pill tone="warning">Not tracked</Pill>}</td></tr>,
          ...(open === key ? [<tr key={`${key}/docs`} className="release-docs"><td /><td colSpan={5}><ul>{release.items.map((item) => <li key={item.key}><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a><small> · {item.state}{item.approvalDate ? ` · approved ${formatDate(item.approvalDate)}` : ''}</small></li>)}</ul></td></tr>] : []),
        ] }))}
      </tbody></table><p className="muted">Release = last Area Path segment (or the release pattern in settings); stream = the segment above it. Tracked = a Feature, User Story or Task in the Time Writing backlog names the release.</p></div>
        : <EmptyState title="No releases found in the documents." detail="Releases are read from the documents' Area Path." />}
  </>
}
