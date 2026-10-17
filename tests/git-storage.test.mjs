import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeBase64, encodeBase64, GitConflictError, historyUrl, parsePlanning, planningData, readPlanningFile, serializePlanning, validateGitConfig, writePlanningFile, loadGitConfig, saveGitConfig } from '../src/gitStorage.ts'

const config = { owner: 'acme', repo: 'demand-planning-data', branch: 'main', path: 'planning-data.json' }
const state = { baselineRules: [{ stream: 'CP', types: {}, items: [{ label: 'Documents', hoursPerUnit: 2, baseUnits: 14, driver: 'assets', unitsPerDriver: 11 }] }], releaseScopes: [{ release: 'CP | Care Pathways | v3.1', stream: 'CP', history: [{ at: '2026-10-01T10:00:00Z', drivers: { assets: 10 }, reason: 'Initial' }] }], resourceProfiles: { 'Zoë Müller': { region: 'Netherlands', role: 'QE' }, 'Arjun Rao': { region: 'India', role: 'Lead', peopleManager: true } } }
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('config validation and browser persistence', () => {
  assert.deepEqual(validateGitConfig({ owner: ' acme ', repo: 'demand-planning-data.git', branch: '', path: '/planning-data.json' }), config)
  assert.throws(() => validateGitConfig({ owner: '', repo: 'x' }), /owner/)
  assert.throws(() => validateGitConfig({ owner: 'a', repo: 'b', path: '../secrets.json' }), /path/)
  assert.throws(() => validateGitConfig({ owner: 'a', repo: 'b', path: 'data.txt' }), /\.json/)
  const store = new Map(); const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  saveGitConfig(config, storage); assert.deepEqual(loadGitConfig(storage), config)
  assert.equal(historyUrl(config), 'https://github.com/acme/demand-planning-data/commits/main/planning-data.json')
})

test('planning data serialises stably and round-trips, including non-ASCII names', () => {
  const data = planningData(state)
  assert.deepEqual(Object.keys(data.resourceProfiles), ['Arjun Rao', 'Zoë Müller'], 'profiles sorted for clean diffs')
  const text = serializePlanning(data)
  assert.deepEqual(parsePlanning(text), data)
  assert.equal(serializePlanning(planningData(parsePlanning(text))), text, 'loading then saving does not change the file')
  assert.equal(decodeBase64(encodeBase64(text)), text)
  assert.throws(() => parsePlanning('{'), /not valid JSON/)
  assert.throws(() => parsePlanning('{"schema":2}'), /schema 1/)
})

test('read: existing file, missing file in an accessible repo, inaccessible repo', async () => {
  const text = serializePlanning(planningData(state))
  const ok = await readPlanningFile(config, 't', async (url, init) => {
    assert.equal(url, 'https://api.github.com/repos/acme/demand-planning-data/contents/planning-data.json?ref=main')
    assert.equal(init.headers.Authorization, 'Bearer t')
    return response(200, { type: 'file', encoding: 'base64', sha: 'abc', content: encodeBase64(text).replace(/(.{60})/g, '$1\n') })
  })
  assert.equal(ok.sha, 'abc'); assert.deepEqual(ok.data, planningData(state))
  const missing = await readPlanningFile(config, 't', async (url) => url.includes('/contents/') ? response(404, {}) : response(200, { name: 'main' }))
  assert.deepEqual(missing, { data: null, sha: null })
  await assert.rejects(readPlanningFile(config, 't', async () => response(404, {})), /not found, or the token cannot access it/)
  await assert.rejects(readPlanningFile(config, 'bad', async () => response(401, {})), /rejected the token/)
})

test('write: one commit with the loaded sha; a concurrent change is a conflict', async () => {
  const data = planningData(state)
  let sent
  const result = await writePlanningFile(config, 't', data, 'abc', 'CP v3.1: 2 assets scoped in', async (url, init) => { sent = { url, init, body: JSON.parse(init.body) }; return response(200, { content: { sha: 'def' }, commit: { html_url: 'https://github.com/acme/demand-planning-data/commit/123' } }) })
  assert.equal(sent.init.method, 'PUT')
  assert.deepEqual([sent.body.message, sent.body.sha, sent.body.branch], ['CP v3.1: 2 assets scoped in', 'abc', 'main'])
  assert.equal(decodeBase64(sent.body.content), serializePlanning(data))
  assert.deepEqual(result, { sha: 'def', commitUrl: 'https://github.com/acme/demand-planning-data/commit/123' })
  const created = await writePlanningFile(config, 't', data, null, '', async (_url, init) => { sent = JSON.parse(init.body); return response(201, { content: { sha: 'new' } }) })
  assert.equal('sha' in sent, false, 'creating the file sends no sha'); assert.equal(sent.message, 'Update planning data'); assert.equal(created.sha, 'new')
  await assert.rejects(writePlanningFile(config, 't', data, 'old', 'x', async () => response(409, {})), GitConflictError)
})
