import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitStorage } from './useGitStorage'
import type { Access } from './useAccess'
import { appBuild } from './buildInfo'
import { todayIso } from './format'
import { parseUsageRecord, recordUsage, serializeUsage, usageMark, usageMarkKey, usageSummary, type UsageRecord, type UsageSummary } from './usageLog'

// Records today's use of the app for the viewer (CON-73): once a day, when Git storage is connected with a writable
// token, the viewer's email is known, no sample data is shown and access.json does not switch the log off. The first
// record in a browser shows a notice saying what is recorded. Also loads everyone's records for the Usage summary.
export function useUsageLog(git: GitStorage, access: Access) {
  const platform: 'web' | 'desktop' = window.location.protocol === 'file:' ? 'desktop' : 'web'
  const enabled = access.loaded && access.policy?.usageLog !== false
  const canRecord = git.connected && !git.readOnly && !git.isSample && Boolean(access.email) && enabled
  const [notice, setNotice] = useState('')
  const [records, setRecords] = useState<{ summary: UsageSummary; loadedAt: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const busy = useRef(false)
  const { readUsageRecord, writeUsageRecord, readUsageRecords } = git

  useEffect(() => {
    if (!canRecord || busy.current) return
    const today = todayIso(), mark = usageMark(access.email, today, appBuild.version, platform)
    let marked = ''
    try { marked = localStorage.getItem(usageMarkKey) ?? '' } catch { marked = '' }
    if (marked === mark) return
    busy.current = true
    void (async () => {
      try {
        const file = await readUsageRecord(access.email)
        let current: UsageRecord | null = null
        if (file.text != null) { try { current = parseUsageRecord(file.text) } catch { current = null } }
        const next = recordUsage(current, { email: access.email, today, version: appBuild.version, platform })
        if (next.changed) await writeUsageRecord(access.email, serializeUsage(next.record), file.sha, `Usage: ${access.email} on ${today} (v${appBuild.version}, ${platform})`)
        try { localStorage.setItem(usageMarkKey, mark) } catch { /* recorded again on the next start */ }
        let shown = ''
        try { shown = localStorage.getItem(`${usageMarkKey}-notice`) ?? '' } catch { shown = '' }
        if (!shown) { setNotice(`Your use of this app is recorded — your email, today's date, the app version and whether you use the web or desktop app — in the data repository (usage/). Settings → Access → Usage shows the records.`); try { localStorage.setItem(`${usageMarkKey}-notice`, '1') } catch { /* shown again next time */ } }
      } catch { /* not recorded today; tried again on the next start */ } finally { busy.current = false }
    })()
  }, [canRecord, access.email, platform, readUsageRecord, writeUsageRecord])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setRecords({ summary: usageSummary(await readUsageRecords(), todayIso()), loadedAt: new Date().toISOString() }) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) } finally { setLoading(false) }
  }, [readUsageRecords])

  return { enabled, canRecord, platform, notice, dismissNotice: () => setNotice(''), summary: records?.summary ?? null, loadedAt: records?.loadedAt ?? '', loading, error, load, history: git.usageHistory }
}
export type UsageLog = ReturnType<typeof useUsageLog>
