import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseQueryWhere, pagedReleaseQuery, fetchReleaseSource, releaseRegister, normalizeReleaseSourceSettings } from '../src/releaseSource.ts'
import { releaseFromPath, releaseOf } from '../src/releasePath.ts'

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
test('name and release are read from a "Release x.y.z" path segment, Area Path first, then Iteration Path', () => {
  assert.deepEqual(releaseFromPath('DHP\\DoseNav\\Release 2.1.0'), { name: 'DoseNav', release: '2.1.0' })
  assert.deepEqual(releaseFromPath('DHP\\DoseNav\\Release 2.1.0\\Sprint 4'), { name: 'DoseNav', release: '2.1.0' })
  assert.deepEqual(releaseFromPath('DHP\\Clinical Library\\release v7.0'), { name: 'Clinical Library', release: '7.0' })
  assert.deepEqual(releaseFromPath('DHP\\Release 3'), { name: 'DHP', release: '3' })
  assert.equal(releaseFromPath('DHP\\DoseNav\\Sprint 4'), undefined)
  assert.equal(releaseFromPath('Release 1.0'), undefined, 'a release segment needs a name above it')
  assert.equal(releaseFromPath(''), undefined)
  assert.deepEqual(releaseOf({ areaPath: 'DHP\\DoseNav\\Release 2.1.0', iterationPath: 'DHP\\Other\\Release 9.9' }), { name: 'DoseNav', release: '2.1.0' })
  assert.deepEqual(releaseOf({ areaPath: 'DHP\\Team A', iterationPath: 'DHP\\DoseNav\\Release 2.2\\Sprint 1' }), { name: 'DoseNav', release: '2.2' })
  assert.deepEqual(normalizeReleaseSourceSettings({ streamSegment: 2, releasePattern: 'x', approvalDateField: 'Custom.Approved' }), { approvalDateField: 'Custom.Approved' })
  assert.deepEqual(normalizeReleaseSourceSettings(undefined), {})
})
test('the register is one flat list of name + release, counts documents and cross-checks the time-writing backlog', () => {
  const source = [doc(1, 'DHFI\\DoseNav\\Release 2.1'), doc(2, 'DHFI\\DoseNav\\Release 2.1'), doc(3, 'DHFI\\DoseNav\\Release 2.10'), doc(4, 'DHFI\\Team', { iterationPath: 'DHFI\\Viewer\\Release 1.0\\Sprint 2' }), doc(5, 'DHFI\\Misc')]
  const backlog = [doc(100, 'X', { project: 'Quality', workItemType: 'Feature', title: 'DP | DoseNav | v2.1' }), doc(101, 'X', { project: 'Quality', workItemType: 'Task', title: 'October 2026 | DoseNav 2.10', state: 'Removed' })]
  const register = releaseRegister(source, backlog)
  assert.deepEqual(register.map((entry) => [entry.name, entry.release, entry.documents]), [['DoseNav', '2.10', 1], ['DoseNav', '2.1', 2], ['Viewer', '1.0', 1]])
  const r21 = register.find((entry) => entry.release === '2.1')
  assert.equal(r21.tracked, true); assert.equal(r21.trackedBy[0].id, 100)
  assert.equal(register.find((entry) => entry.release === '2.10').tracked, false, 'v2.1 does not track 2.10, and removed items do not count')
  assert.equal('stream' in register[0], false, 'no stream grouping')
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

import { approvalDateFrom, completedReleases, approvalMonthOf } from '../src/releaseSource.ts'
test('Author Approval Date is read from the configured field or any approval-date field', () => {
  assert.equal(approvalDateFrom({ 'Custom.AuthorApprovalDate': '2026-10-09T10:00:00Z', 'System.CreatedDate': '2026-01-01T00:00:00Z' }), '2026-10-09T10:00:00Z')
  assert.equal(approvalDateFrom({ 'Custom.DateOfApproval': '2026-10-09T10:00:00Z' }), '2026-10-09T10:00:00Z')
  assert.equal(approvalDateFrom({ 'Custom.Other': '2026-10-09T10:00:00Z' }), undefined)
  assert.equal(approvalDateFrom({ 'Custom.Other': '2026-10-09T10:00:00Z' }, { approvalDateField: 'Custom.Other' }), '2026-10-09T10:00:00Z')
  assert.equal(approvalDateFrom({ 'Custom.AuthorApprovalDate': 'not a date' }), undefined)
  assert.equal(approvalMonthOf('2026-10-31T20:00:00Z'), '2026-11', 'approval month is bucketed in India time')
})
test('completed releases are those approved in the selected month', () => {
  const source = [doc(1, 'DHFI\\Dose Planning\\Release 4.2', { title: 'Design Review Approval', approvalDate: '2026-10-12T09:00:00Z' }), doc(2, 'DHFI\\Dose Planning\\Release 4.2', { title: 'Verification Summary', approvalDate: '2026-10-20T09:00:00Z' }), doc(3, 'DHFI\\Care Pathways\\Release 3.1', { approvalDate: '2026-09-12T09:00:00Z' }), doc(4, 'DHFI\\Clinical Library\\Release 7.0', { title: 'No approval yet' })]
  const register = releaseRegister(source, [doc(100, 'X', { project: 'Quality', workItemType: 'Feature', title: 'DP | Dose Planning | v4.2' })])
  assert.deepEqual(completedReleases(register, '2026-10').map((release) => [release.name, release.release, release.approvalDate, release.tracked]), [['Dose Planning', '4.2', '2026-10-20T09:00:00Z', true]])
  assert.deepEqual(completedReleases(register, '2026-09').map((release) => release.release), ['3.1'])
  assert.equal(register.find((release) => release.name === 'Clinical Library').approvalMonth, undefined)
})

test('planned and booked hours per release come from the Time Writing Tasks under the tracking Features, each counted once', () => {
  const source = [doc(1, 'DHFI\\DoseNav\\Release 2.1'), doc(2, 'DHFI\\Viewer\\Release 1.0')]
  const backlog = [
    doc(100, 'X', { workItemType: 'Feature', title: 'DP | DoseNav | v2.1' }),
    doc(110, 'X', { workItemType: 'User Story', title: 'DP | DoseNav | v2.1 - Time Writing', parentId: 100 }),
    doc(111, 'X', { workItemType: 'Task', title: 'September 2026 | DoseNav 2.1', parentId: 110, originalEstimate: 10, completedWork: 8 }),
    doc(112, 'X', { workItemType: 'Task', title: 'October 2026 | DoseNav 2.1', parentId: 110, originalEstimate: 6, completedWork: 9 }),
    doc(113, 'X', { workItemType: 'Task', title: 'Review comments', parentId: 100, originalEstimate: 50, completedWork: 50 }),
    doc(114, 'X', { workItemType: 'Task', title: 'November 2026 | DoseNav 2.1', parentId: 110, originalEstimate: 4, completedWork: -1, state: 'Removed' }),
  ]
  const register = releaseRegister(source, backlog)
  const r21 = register.find((entry) => entry.release === '2.1')
  assert.deepEqual([r21.planned, r21.booked, r21.hourTasks], [16, 17, 2], 'two month tasks; not the plain task, not the removed one; the tracking Task 111 is not counted twice')
  assert.deepEqual([register.find((entry) => entry.name === 'Viewer').hourTasks, register.find((entry) => entry.name === 'Viewer').planned], [0, 0])
})
