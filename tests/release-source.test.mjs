import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseQueryWhere, pagedReleaseQuery, fetchReleaseSource, releaseIdentifier, streamOf, releaseRegister, normalizeReleaseSourceSettings } from '../src/releaseSource.ts'

const config = { organization: 'org', project: 'DHFI', team: '' }
const doc = (id, areaPath, extra = {}) => ({ key: `org/dhfi/${id}`, id, title: `Doc ${id}`, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath, iterationPath: '', tags: '', url: '', organization: 'org', project: 'DHFI', syncedAt: '', ...extra })

test('a pasted saved query is reduced to its WHERE clause and paged by ID', () => {
  const where = releaseQueryWhere("SELECT [System.Id], [System.Title]\nFROM WorkItems\nWHERE [System.TeamProject] = @project AND [System.State] = 'Approved'\nORDER BY [System.ChangedDate] DESC")
  assert.equal(where, "[System.TeamProject] = @project AND [System.State] = 'Approved'")
  assert.match(pagedReleaseQuery(where, 0), /^SELECT \[System\.Id\] FROM WorkItems WHERE \(.*\) AND \[System\.Id\] > 0 ORDER BY \[System\.Id\] ASC$/)
  assert.throws(() => releaseQueryWhere('SELECT [System.Id] FROM WorkItemLinks WHERE 1=1'), /flat work-item query/)
  assert.throws(() => releaseQueryWhere("SELECT [System.Id] FROM WorkItems WHERE [System.Id] > 0 ASOF '2026-01-01'"), /ASOF/)
})
test('fetchReleaseSource pages the query, reads items in batches and keeps the query text', async () => {
  const calls = []
  const transport = async (request) => {
    calls.push(request)
    assert.equal(request.team, 'DHFI', 'team falls back to the project for the proxy')
    if (request.operation === 'query') { const after = Number(/> (\d+) ORDER/.exec(request.query)[1]); return { workItems: after === 0 ? [{ id: 5 }, { id: 9 }] : [] } }
    if (request.operation === 'items') return { value: request.ids.map((id) => ({ id, fields: { 'System.Title': `Doc ${id}`, 'System.WorkItemType': 'Document', 'System.State': 'Approved', 'System.AreaPath': `DHFI\\Stream A\\Rel${id}` } })) }
    throw new Error(`unexpected ${request.operation}`)
  }
  const snapshot = await fetchReleaseSource(config, 'pat', "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Approved'", transport)
  assert.equal(snapshot.items.length, 2); assert.equal(snapshot.project, 'DHFI'); assert.match(snapshot.query, /Approved/)
  assert.equal(snapshot.items[0].areaPath, 'DHFI\\Stream A\\Rel5'); assert.equal(snapshot.items[0].key, 'org/dhfi/5')
  assert.deepEqual(calls.map((call) => call.operation), ['query', 'items', 'query'])
  await assert.rejects(fetchReleaseSource(config, '', 'SELECT [System.Id] FROM WorkItems WHERE 1=1', transport), /PAT/)
})
test('release identifier is the last area segment (or a capture pattern) and the stream is the configured segment', () => {
  const item = doc(1, 'DHFI\\Stream A\\Rel 12.3')
  assert.equal(releaseIdentifier(item), 'Rel 12.3'); assert.equal(streamOf(item), 'Stream A')
  assert.equal(releaseIdentifier(doc(2, 'DHFI')), '', 'project-only area path has no release')
  assert.equal(streamOf(doc(3, 'DHFI\\Rel 1')), 'Unmapped', 'release directly below the project has no stream')
  assert.equal(releaseIdentifier(item, { streamSegment: 1, releasePattern: 'Rel\\s*([\\d.]+)' }), '12.3')
  assert.equal(releaseIdentifier(item, { streamSegment: 1, releasePattern: '(' }), 'Rel 12.3', 'invalid pattern falls back')
  assert.deepEqual(normalizeReleaseSourceSettings({ streamSegment: '2', releasePattern: ' Rel(\\d+) ' }), { streamSegment: 2, releasePattern: 'Rel(\\d+)' })
  assert.deepEqual(normalizeReleaseSourceSettings({ streamSegment: 0, releasePattern: '(' }), { streamSegment: 1 })
})
test('the register lists releases per stream, counts documents, and cross-checks the time-writing backlog', () => {
  const source = [doc(1, 'DHFI\\Stream A\\Rel2'), doc(2, 'DHFI\\Stream A\\Rel2'), doc(3, 'DHFI\\Stream A\\Rel10'), doc(4, 'DHFI\\Stream B\\Rel1'), doc(5, 'DHFI\\Rel9'), doc(6, 'DHFI')]
  const backlog = [doc(100, 'X', { project: 'Quality', workItemType: 'Feature', title: 'Program | Service | Rel2' }), doc(101, 'X', { project: 'Quality', workItemType: 'Task', title: 'October 2026 | rel10 work', state: 'Removed' })]
  const register = releaseRegister(source, backlog)
  assert.deepEqual(register.map((stream) => stream.summary), ['Stream A (2): Rel2, Rel10', 'Stream B (1): Rel1', 'Unmapped (1): Rel9'])
  const streamA = register[0]
  assert.equal(streamA.releases[0].documents, 2); assert.equal(streamA.releases[0].tracked, true); assert.equal(streamA.releases[0].trackedBy[0].id, 100)
  assert.equal(streamA.releases[1].tracked, false, 'removed backlog items do not count as tracking')
  assert.deepEqual(releaseRegister(undefined, backlog), [])
})

import { saveAzureConnectionProfile, listAzureConnectionProfiles, loadAzureConnectionProfile } from '../src/azureCredentials.ts'
test('a release-source configuration keeps its role and needs no creator email', () => {
  const store = new Map(); const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  saveAzureConnectionProfile({ id: 'dhfi', url: 'https://dev.azure.com/org/DHFI', reason: 'DHFI releases', role: 'release-source', token: 'pat' }, storage)
  saveAzureConnectionProfile({ id: 'rw', url: 'https://dev.azure.com/org/Quality', reason: 'Time writing', creatorEmail: 'a@b.co', token: 'pat2' }, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage).map((profile) => [profile.id, profile.role]), [['dhfi', 'release-source'], ['rw', 'time-tracking']])
  assert.equal(loadAzureConnectionProfile('dhfi', storage).role, 'release-source')
  assert.throws(() => saveAzureConnectionProfile({ id: 'x', url: 'https://dev.azure.com/org/P', reason: 'r', role: 'admin', token: 't' }, storage))
})
