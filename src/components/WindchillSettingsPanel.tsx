import { useState } from 'react'
import { Notice, Panel, Pill } from './ui'
import { loadWindchillSettings, normalizeServicePath, normalizeWindchillHost, saveWindchillSettings, windchillServiceUrl, type WindchillSettings, type WindchillTestResult } from '../windchill'

// Windchill host setup: where Windchill is and which search to run. Saved in this browser only; the connection
// test and the searches run from the desktop app, with Windows single sign-on or, when Windchill shows a login page,
// the app's sign-in window (the login page is completed there; the app never sees the password).
export function WindchillSettingsPanel() {
  const [saved, setSaved] = useState<WindchillSettings>(loadWindchillSettings)
  const [draft, setDraft] = useState<WindchillSettings>(saved)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [test, setTest] = useState<WindchillTestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const desktop = Boolean(window.windchill)
  const set = (patch: Partial<WindchillSettings>) => { setNotice(null); setDraft((current) => ({ ...current, ...patch })) }
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const next = { ...draft, host: normalizeWindchillHost(draft.host), servicePath: normalizeServicePath(draft.servicePath), objectType: draft.objectType.trim(), filter: draft.filter.trim(), fields: draft.fields.trim() }
      saveWindchillSettings(next); setSaved(next); setDraft(next); setTest(null)
      setNotice({ tone: 'success', text: 'Windchill settings saved in this browser.' })
    } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not save the Windchill settings.' }) }
  }

  async function run(action: 'test' | 'signIn') {
    const call = window.windchill?.[action]
    if (!call || !saved.host) return
    setBusy(true); setTest(null)
    try { setTest(await call({ host: saved.host, servicePath: saved.servicePath })) }
    catch (failure) { setTest({ ok: false, status: 0, message: failure instanceof Error ? failure.message : 'The test failed.', services: [] }) }
    finally { setBusy(false) }
  }

  async function signOut() {
    if (!window.windchill?.signOut) return
    setBusy(true); setTest(null)
    try { await window.windchill.signOut(); setNotice({ tone: 'info', text: 'Signed out of Windchill in the desktop app.' }) }
    catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not sign out.' }) }
    finally { setBusy(false) }
  }

  return <Panel className="connection-panel" eyebrow="WINDCHILL" title="Windchill host" detail="Where Windchill is; the searches are the Windchill views below. Saved in this browser only; no password is stored. The connection test and the searches run from the desktop app with your Windows single sign-on; if Windchill shows a login page, Sign in opens it in a window and keeps the session in the app — the web version cannot reach Windchill on the company network."
    action={<Pill tone={saved.host ? test?.ok ? 'open' : test ? 'danger' : 'info' : 'neutral'}>{saved.host ? test?.ok ? 'Connected' : test ? 'Test failed' : 'Saved' : 'Not set'}</Pill>}>
    <form className="connection-form" onSubmit={save}>
      <label>Host<input required value={draft.host} onChange={(event) => set({ host: event.target.value })} placeholder="plm.example.com" /></label>
      <label>Service path<input required value={draft.servicePath} onChange={(event) => set({ servicePath: event.target.value })} placeholder="/Windchill/servlet/odata" /></label>
      <label>Login<select value={draft.login} onChange={() => set({ login: 'sso' })}><option value="sso">Windows single sign-on (desktop app)</option></select></label>
      <div className="connection-actions"><button className="primary" disabled={!dirty}>Save</button><button type="button" className="ghost" disabled={!desktop || !saved.host || dirty || busy} title={desktop ? undefined : 'Available in the desktop app'} onClick={() => void run('test')}>{busy ? 'Working…' : 'Test connection'}</button>
        {window.windchill?.signIn && <button type="button" className={test?.signIn ? 'primary' : 'ghost'} disabled={!saved.host || dirty || busy} onClick={() => void run('signIn')}>Sign in</button>}
        {window.windchill?.signOut && <button type="button" className="ghost" disabled={busy} onClick={() => void signOut()}>Sign out</button>}</div>
    </form>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {saved.host && <p className="muted">Service address: {windchillServiceUrl(saved)}{!desktop ? ' · Open the desktop app to test the connection.' : dirty ? ' · Save first to test the new values.' : ''}</p>}
    {test && <Notice tone={test.ok ? 'success' : 'error'}>{test.message}{test.services.length > 0 && <> Services: {test.services.join(', ')}.</>}</Notice>}
  </Panel>
}
