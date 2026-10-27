import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, startApp, text } from './helpers.mjs'

// Usage log scenario of the UAT (TC-CON-41): with Git storage connected (GitHub mocked in the page, no network) and a
// Time Writing connection with an email, opening the app records today's use once, says so, and Settings → Access →
// Usage summarises the records.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// An in-page GitHub contents API over a file map: enough for the write check, the data file, access.json and usage/.
async function mockGitHub(page, files, log) {
  const b64 = (value) => Buffer.from(value, 'utf8').toString('base64')
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    log.push(`${method} ${url.pathname}`)
    if (url.pathname === '/repos/org/data') return json(200, { permissions: { push: true } })
    if (url.pathname === '/repos/org/data/branches/main') return json(200, { name: 'main' })
    const match = /^\/repos\/org\/data\/contents\/(.+)$/.exec(url.pathname)
    if (!match) return json(404, { message: 'Not Found' })
    const path = decodeURIComponent(match[1])
    if (method === 'PUT') {
      if (path === '.demand-planning-write-check') return json(422, { message: 'probe' })
      const body = JSON.parse(request.postData() ?? '{}')
      files.set(path, Buffer.from(body.content, 'base64').toString('utf8'))
      return json(201, { content: { sha: `sha-${files.size}` }, commit: { html_url: `https://github.com/org/data/commit/${files.size}` } })
    }
    if (files.has(path)) {
      if ((request.headers().accept ?? '').includes('raw')) return route.fulfill({ status: 200, contentType: 'text/plain', body: files.get(path) })
      return json(200, { type: 'file', encoding: 'base64', content: b64(files.get(path)), sha: `sha-${path}` })
    }
    const folder = [...files.keys()].filter((name) => name.startsWith(`${path}/`)).map((name) => ({ type: 'file', name: name.slice(path.length + 1), path: name, sha: `sha-${name}` }))
    if (folder.length) return json(200, folder)
    return json(404, { message: 'Not Found' })
  })
  await page.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: [], workItems: [], count: 0 }) }))
}

const init = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'org', repo: 'data', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'e2e-git-token')
  localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([{ id: 'tw', url: 'https://dev.azure.com/org/QMS/_backlogs/backlog/Team%20A/Epics', reason: 'QMS-0025', role: 'time-tracking', creatorEmail: 'Dana@Example.com', showInMenu: true, token: 'pat' }]))
}

test('TC-CON-41: opening the app records today\'s use once, with a notice, and Settings → Access → Usage summarises the records', async () => {
  const files = new Map([['usage/other_at_example.com.json', JSON.stringify({ schema: 1, email: 'other@example.com', firstSeen: '2026-01-05', lastSeen: '2026-01-05', days: ['2026-01-05'], version: '1.0.0', platform: 'desktop' })]])
  const log = []
  const context = await app.browser.newContext({ viewport: { width: 1300, height: 1000 } })
  await context.addInitScript(() => { localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed') })
  await context.addInitScript(init)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockGitHub(page, files, log)
  await page.goto(app.url)
  await page.locator('.notice', { hasText: 'Your use of this app is recorded' }).waitFor({ timeout: 15000 })
  const today = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const record = JSON.parse(files.get('usage/dana_at_example.com.json'))
  assert.equal(record.email, 'dana@example.com')
  assert.deepEqual(record.days, [today])
  assert.equal(record.platform, 'web')
  assert.match(record.version, /^\d+\.\d+\.\d+$/)
  assert.equal(JSON.stringify(record).includes('token'), false, 'no credential in the record')
  assert.equal(log.filter((entry) => entry.startsWith('PUT') && entry.includes('usage')).length, 1, 'one commit')
  await page.getByRole('button', { name: 'Dismiss message' }).first().click()

  await navigate(page, 'Settings')
  await page.getByRole('tab', { name: 'Access' }).click().catch(() => page.getByRole('button', { name: 'Access' }).first().click())
  const panel = page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Usage/ }) }).first()
  await panel.waitFor()
  assert.match(await text(panel), /Recording is on/)
  await panel.getByRole('button', { name: 'Load usage' }).click()
  await panel.locator('table tbody tr').first().waitFor()
  const body = await text(panel)
  assert.match(body, /People 2/)
  assert.match(body, /Active last 7 days 1/)
  const rows = (await panel.locator('table tbody tr').allInnerTexts()).map((row) => row.replace(/\s+/g, ' '))
  assert.ok(rows[0].startsWith(`dana@example.com ${today} ${today} 1 1 1`), `newest first: ${rows[0]}`)
  assert.ok(rows[1].startsWith('other@example.com 2026-01-05 2026-01-05 1 0 0 1.0.0 desktop'), rows[1])

  // A reload the same day reads nothing and writes nothing more.
  const before = log.length
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await page.waitForTimeout(1500)
  assert.equal(log.slice(before).filter((entry) => entry.includes('usage')).length, 0, 'no usage request on a reload the same day')
  assert.deepEqual(errors, [])
  await context.close()
})
