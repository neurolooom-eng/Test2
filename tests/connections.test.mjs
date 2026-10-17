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
  assert.throws(() => composeAzureUrl('https://example.com/org', 'P'), /dev\.azure\.com/)
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
