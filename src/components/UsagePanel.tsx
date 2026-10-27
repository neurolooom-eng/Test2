import { useState } from 'react'
import type { Access } from '../useAccess'
import type { UsageLog } from '../useUsageLog'
import { formatDateTime } from '../format'
import { Metric, Metrics, Notice, Panel } from './ui'

// Settings → Access → Usage (CON-74): who uses the app and when, from the usage/ records in the Git data repository —
// people active in the last 7 and 30 days, each person's first and last day, days used, version and platform, and
// person-days per month — with the Admin switch that turns the recording on or off for everyone (access.json).
export function UsagePanel({ usage, access }: { usage: UsageLog; access: Access }) {
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState('')
  const manages = access.can('access.manage') && Boolean(access.policy)
  const summary = usage.summary
  async function toggle(on: boolean) {
    if (!access.policy) return
    setSaving(true); setResult('')
    try { await access.save({ ...access.policy, usageLog: on }, on ? 'Usage log on' : 'Usage log off'); setResult(on ? 'Usage log switched on for everyone.' : 'Usage log switched off for everyone.') } catch (failure) { setResult(failure instanceof Error ? failure.message : String(failure)) } finally { setSaving(false) }
  }
  return <Panel title="Usage" info={<p>Every app records, once a day, who used it and when: the person's email (from their Time Writing connection), the day, the app version and web or desktop — to usage/&lt;email&gt;.json in the Git data repository, with their own Git token (so a read-only token records nothing). Nothing about what was looked at or changed. The switch below turns the recording on or off for everyone; the records stay in Git until removed there.</p>}
    action={<div className="button-row">{usage.history && <a href={usage.history} target="_blank" rel="noreferrer">History in Git</a>}<button type="button" className="primary" disabled={usage.loading} onClick={() => void usage.load()}>{usage.loading ? 'Loading…' : summary ? 'Reload usage' : 'Load usage'}</button></div>}>
    <p className="muted">Recording is <strong>{usage.enabled ? 'on' : 'off'}</strong>{usage.enabled && !usage.canRecord ? ' (not from this browser: it needs Git storage with a writable token, your email on the Time Writing connection, and no sample data)' : ''}.{manages && <> <button type="button" className="text-button" disabled={saving} onClick={() => void toggle(!usage.enabled)}>{usage.enabled ? 'Switch off for everyone' : 'Switch on for everyone'}</button></>}</p>
    {result && <Notice tone="info">{result}</Notice>}
    {usage.error && <Notice tone="error">{usage.error}</Notice>}
    {summary && <>
      <Metrics><Metric label="People" value={summary.people.length} /><Metric label="Active last 7 days" value={summary.active7} /><Metric label="Active last 30 days" value={summary.active30} /><Metric label="Loaded" value={formatDateTime(usage.loadedAt)} /></Metrics>
      {summary.people.length === 0 ? <p className="muted">No usage recorded yet.</p> : <table><thead><tr><th>Person</th><th>Last used</th><th>First used</th><th>Days used</th><th>Last 7 days</th><th>Last 30 days</th><th>Version</th><th>Platform</th></tr></thead><tbody>
        {summary.people.map((person) => <tr key={person.email}><td>{person.email}</td><td>{person.lastSeen}</td><td>{person.firstSeen}</td><td>{person.daysUsed}</td><td>{person.last7}</td><td>{person.last30}</td><td>{person.version || '—'}</td><td>{person.platform}</td></tr>)}
      </tbody></table>}
      {summary.byMonth.length > 0 && <details className="dp-counted"><summary>Per month ({summary.byMonth.length})</summary><table><thead><tr><th>Month</th><th>People</th><th>Person-days</th></tr></thead><tbody>{summary.byMonth.map((entry) => <tr key={entry.month}><td>{entry.month}</td><td>{entry.people}</td><td>{entry.days}</td></tr>)}</tbody></table></details>}
    </>}
  </Panel>
}
