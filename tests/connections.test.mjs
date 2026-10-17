import test from 'node:test'
import assert from 'node:assert/strict'
import { composeAzureUrl, splitAzureUrl, saveAzureConnectionProfile, listAzureConnectionProfiles, loadAzureConnectionProfile } from '../src/azureCredentials.ts'
import { runWorkItemQuery, withAncestors, projectQuery, defaultReleaseQuery, releaseQueryWhere } from '../src/releaseSource.ts'
import { parseAzureProjectUrl } from '../src/azureDevOps.ts'

const memory = () => { const store = new Map(); return { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } }

test('base URL + project (+ team) compose to a project URL and split back', () => {
  const url = composeAzureUrl('https://dev.azure.com/ALMP-ORG-MSTP01/', 'Patient Safety and Quality', 'InD Quality')
  assert.equal(url, 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics')
  assert.deepEqual(parseAzureProjectUrl(url), { organization: 'ALMP-ORG-MSTP01', project: 'Patient Safety and Quality', team: 'InD Quality' })
  assert.deepEqual(splitAzureUrl(url), { baseUrl: 'https://dev.azure.com/ALMP-ORG-MSTP01', project: 'Patient Safety and Quality', team: 'InD Quality' })
  assert.equal(composeAzureUrl('https://dev.azure.com/org/Some/Project/Path', 'DHFI'), 'https://dev.azure.com/org/DHFI', 'a pasted project URL keeps only the organization')
  assert.throws(() => composeAzureUrl('http://tfs.example.com/tfs/Coll', 'P'), /https/)
  assert.throws(() => composeAzureUrl('https://user:pw@dev.azure.com/org', 'P'), /https/)
  assert.throws(() => composeAzureUrl('https://dev.azure.com/', 'P'), /organization/)
  assert.throws(() => composeAzureUrl('https://dev.azure.com/org', ' '), /project/)
})

test('any number of connection sets, each with its own role and optional query', () => {
  const storage = memory()
  const sets = [
    { id: 'tw', url: composeAzureUrl('https://dev.azure.com/org', 'Quality', 'Team A'), reason: 'Time Writing', role: 'time-tracking', token: 'a' },
    { id: 'dhfi', url: composeAzureUrl('https://dev.azure.com/org', 'DHFI'), reason: 'DHFI releases', role: 'release-source', query: defaultReleaseQuery, token: 'b' },
    { id: 'vault', url: composeAzureUrl('https://dev.azure.com/org', 'Vault'), reason: 'Vault', role: 'documents', query: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Document'", token: 'c' },
    { id: 'ref', url: composeAzureUrl('https://dev.azure.com/other', 'Ops'), reason: 'Ops reference', role: 'reference', token: 'd' },
  ]
  for (const set of sets) saveAzureConnectionProfile(set, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage).map((profile) => [profile.id, profile.role, Boolean(profile.query)]), [['tw', 'time-tracking', false], ['dhfi', 'release-source', true], ['vault', 'documents', true], ['ref', 'reference', false]])
  assert.equal(listAzureConnectionProfiles(storage).some((profile) => 'token' in profile), false, 'the list never exposes PATs')
  assert.equal(loadAzureConnectionProfile('vault', storage).token, 'c')
  assert.throws(() => saveAzureConnectionProfile({ ...sets[0], id: 'big', query: 'x'.repeat(50001) }, storage))
  assert.equal(releaseQueryWhere(projectQuery), "[System.TeamProject] = @project AND [System.State] <> 'Removed'")
})

const raw = (id, parent, type = 'Task') => ({ id, fields: { 'System.Title': `Item ${id}`, 'System.WorkItemType': type, 'System.State': 'Active', 'System.TeamProject': 'Quality', ...(parent ? { 'System.Parent': parent } : {}) } })

test('a query is paged by id and read in batches; parents the query missed are added', async () => {
  const config = { organization: 'org', project: 'Quality', team: '' }
  const calls = []
  const world = new Map([[1, raw(1, null, 'Epic')], [2, raw(2, 1, 'Feature')], [3, raw(3, 2, 'User Story')], [10, raw(10, 3)], [11, raw(11, 3)]])
  const transport = async (request) => {
    calls.push(request.operation)
    assert.equal(request.team, 'Quality', 'team falls back to the project for the proxy')
    if (request.operation === 'query') { assert.match(request.query, /^SELECT \[System\.Id\] FROM WorkItems WHERE /); const after = Number(/> (\d+) ORDER/.exec(request.query)[1]); return { workItems: after === 0 ? [{ id: 10 }, { id: 11 }] : [] } }
    return { value: request.ids.map((id) => world.get(id)) }
  }
  const tasks = await runWorkItemQuery(config, 'pat', "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Task'", transport)
  assert.deepEqual(tasks.map((item) => item.id), [10, 11])
  const all = await withAncestors(config, 'pat', tasks, transport)
  assert.deepEqual(all.map((item) => [item.id, item.workItemType]), [[10, 'Task'], [11, 'Task'], [3, 'User Story'], [2, 'Feature'], [1, 'Epic']])
  await assert.rejects(runWorkItemQuery(config, '', projectQuery, transport), /PAT/)
})

import { normalizeBaseUrl, collectionUrl, projectApiBase, apiVersionOf, sameAzureScope, mapAzureWorkItem, requestAzure } from '../src/azureDevOps.ts'
test('on-premises Azure DevOps Server: collection base URL, project and team', () => {
  const base = 'https://tfs.example.com/tfs/DefaultCollection/'
  assert.equal(normalizeBaseUrl(base), 'https://tfs.example.com/tfs/DefaultCollection')
  const url = composeAzureUrl(base, 'Quality Hub', 'Team A')
  assert.equal(url, 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub/_backlogs/backlog/Team%20A/Epics')
  const config = parseAzureProjectUrl(url, base)
  assert.deepEqual(config, { organization: 'DefaultCollection', project: 'Quality Hub', team: 'Team A', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection' })
  assert.deepEqual(splitAzureUrl(url, base), { baseUrl: 'https://tfs.example.com/tfs/DefaultCollection', project: 'Quality Hub', team: 'Team A' })
  assert.equal(projectApiBase(config), 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub')
  assert.equal(mapAzureWorkItem({ id: 7, fields: { 'System.Title': 'x' } }, config).url, 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub/_workitems/edit/7')
  assert.throws(() => parseAzureProjectUrl('https://other.example.com/tfs/DefaultCollection/Quality', base), /does not belong/)
  assert.equal(collectionUrl({ organization: 'org' }), 'https://dev.azure.com/org', 'no base URL means Azure DevOps Services')
  assert.equal(sameAzureScope(config, { ...config, baseUrl: 'https://tfs2.example.com/tfs/DefaultCollection' }), false, 'same names on another server are a different scope')
  assert.equal(sameAzureScope({ organization: 'org', project: 'P', team: 'T' }, { organization: 'org', project: 'P', team: 'T', baseUrl: 'https://dev.azure.com/org' }), true)
  assert.equal(apiVersionOf({}), '7.1'); assert.equal(apiVersionOf({ apiVersion: '6.0' }), '6.0'); assert.equal(apiVersionOf({ apiVersion: '7.1; drop' }), '7.1')
})

test('on-prem connection sets are saved with their base URL and API version', () => {
  const storage = memory()
  const base = 'https://tfs.example.com/tfs/DefaultCollection'
  saveAzureConnectionProfile({ id: 'onprem', url: composeAzureUrl(base, 'Vault'), baseUrl: base, apiVersion: '6.0', reason: 'Vault on-prem', role: 'documents', token: 't' }, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage)[0], { id: 'onprem', url: 'https://tfs.example.com/tfs/DefaultCollection/Vault', reason: 'Vault on-prem', role: 'documents', baseUrl: base, apiVersion: '6.0' })
  assert.throws(() => saveAzureConnectionProfile({ id: 'x', url: 'https://tfs.example.com/other/Vault', baseUrl: base, reason: 'r', token: 't' }, storage), 'project URL must sit under the base URL')
  assert.throws(() => saveAzureConnectionProfile({ id: 'y', url: 'https://tfs.example.com/tfs/DefaultCollection/V', reason: 'r', token: 't' }, storage), 'a non-cloud URL needs its base URL')
})

test('browser requests go to the configured server with its API version', async () => {
  const calls = []
  globalThis.window ??= {}
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ workItems: [] }) } }
  await requestAzure({ organization: 'DefaultCollection', project: 'Quality', team: 'Quality', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection', apiVersion: '6.0', pat: 'p', operation: 'query', query: 'SELECT [System.Id] FROM WorkItems WHERE [System.Id] > 0' })
  assert.equal(calls[0].url, 'https://tfs.example.com/tfs/DefaultCollection/Quality/_apis/wit/wiql?api-version=6.0&$top=1000')
})

import { createRequire } from 'node:module'
test('Windows app proxy: on-prem collection base URL and API version; plain http refused', () => {
  const { azureReadRequest, azureTimeWritingEffortRequest } = createRequire(import.meta.url)('../electron/azure-devops.cjs')
  const onPrem = { organization: 'DefaultCollection', project: 'Quality Hub', team: 'Team A', pat: 'p', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection', apiVersion: '6.0' }
  assert.equal(azureReadRequest({ ...onPrem, operation: 'areas' }).url, 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub/Team%20A/_apis/work/teamsettings/teamfieldvalues?api-version=6.0')
  assert.equal(azureTimeWritingEffortRequest({ ...onPrem, operation: 'update-time-writing-effort', workItemId: 5, planHours: 8 }).url, 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub/_apis/wit/workitems/5?api-version=6.0')
  assert.equal(azureReadRequest({ organization: 'org', project: 'P', team: 'T', pat: 'p', operation: 'areas' }).url, 'https://dev.azure.com/org/P/T/_apis/work/teamsettings/teamfieldvalues?api-version=7.1')
  assert.throws(() => azureReadRequest({ ...onPrem, operation: 'areas', baseUrl: 'http://tfs.example.com/tfs/DefaultCollection' }), /https/)
  assert.equal(azureReadRequest({ ...onPrem, operation: 'areas', apiVersion: '7.1&evil=1' }).url.endsWith('api-version=7.1'), true)
})
