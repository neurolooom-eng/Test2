import test from 'node:test'
import assert from 'node:assert/strict'
import { baselineHours, describeRule, exampleBaselineRules, normalizeRules, normalizeScopes, releaseBaselines, ruleDrivers } from '../src/baseline.ts'

const [dp, serviceability, cp] = exampleBaselineRules

test('CP: 2h per document over 14 base documents plus 11 per asset', () => {
  const result = baselineHours(cp, { drivers: { assets: 10 } })
  assert.equal(result.total, 248, '10 × 11 × 120 + 14 × 120 minutes = 14,880 min = 248h')
  assert.deepEqual(result.lines, [{ label: 'Documents', units: 124, hours: 248 }])
  assert.deepEqual(ruleDrivers(cp), ['assets'])
  assert.equal(describeRule(cp), 'Documents: 2h × (14 + 11 × assets)')
  assert.deepEqual(baselineHours(cp, { drivers: {} }).missing, ['assets'])
})

test('DP: fixed hours by release type; unknown or missing type is reported', () => {
  assert.equal(baselineHours(dp, { type: 'Major', drivers: {} }).total, 40)
  assert.equal(baselineHours(dp, { type: 'MLD', drivers: {} }).total, 30)
  assert.equal(baselineHours(dp, { type: 'PU', drivers: {} }).total, 20)
  assert.deepEqual(baselineHours(dp, { drivers: {} }).missing, ['type'])
  assert.deepEqual(baselineHours(dp, { type: 'Hotfix', drivers: {} }).missing, ['type'])
})

test('Serviceability: 2h per document, capped at 60h', () => {
  assert.equal(baselineHours(serviceability, { drivers: { documents: 20 } }).total, 40)
  const capped = baselineHours(serviceability, { drivers: { documents: 45 } })
  assert.deepEqual([capped.total, capped.uncapped, capped.capped], [60, 90, true])
  assert.equal(describeRule(serviceability), 'Documents: 2h × documents · max 60h')
})

test('rules and scopes are normalised from stored data', () => {
  assert.deepEqual(normalizeRules(undefined), exampleBaselineRules)
  assert.deepEqual(normalizeRules([]), [])
  assert.deepEqual(normalizeRules([{ stream: ' QMS ', types: { A: '5', B: -1, '': 3 }, items: [{ label: 'Procedures', hoursPerUnit: 1.5, driver: 'procedures', unitsPerDriver: 1 }, { label: '', hoursPerUnit: 1 }], cap: 0 }, { stream: 'qms' }, 'x']),
    [{ stream: 'QMS', types: { A: 5 }, items: [{ label: 'Procedures', hoursPerUnit: 1.5, baseUnits: 0, driver: 'procedures', unitsPerDriver: 1 }] }])
  assert.deepEqual(normalizeScopes([{ release: 'R', stream: 'CP', history: [{ at: '2026-10-14T00:00:00Z', drivers: { assets: 10 } }, { at: '2026-10-01T00:00:00Z', drivers: { assets: 8 }, reason: 'Initial' }, { at: 'bad', drivers: {} }] }, { release: '', stream: 'CP', history: [] }]),
    [{ release: 'R', stream: 'CP', history: [{ at: '2026-10-01T00:00:00Z', drivers: { assets: 8 }, reason: 'Initial' }, { at: '2026-10-14T00:00:00Z', drivers: { assets: 10 } }] }])
})

test('release rows: baseline from latest scope, growth since first scope, actual from the Feature Time Writing Tasks', () => {
  const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '' }
  const items = [
    { ...base, key: 'o/p/1', id: 1, title: 'CP', workItemType: 'Epic' },
    { ...base, key: 'o/p/2', id: 2, title: 'CP | Care Pathways | v3.1', workItemType: 'Feature', parentId: 1 },
    { ...base, key: 'o/p/3', id: 3, title: 'CP | Care Pathways | v3.1 - Time Writing', workItemType: 'User Story', parentId: 2 },
    { ...base, key: 'o/p/4', id: 4, title: 'September 2026 | CP', workItemType: 'Task', parentId: 3, completedWork: 120 },
    { ...base, key: 'o/p/5', id: 5, title: 'October 2026 | CP', workItemType: 'Task', parentId: 3, completedWork: 150 },
    { ...base, key: 'o/p/6', id: 6, title: 'CP | Care Pathways | v3.1 | SFV review', workItemType: 'User Story', parentId: 2 },
    { ...base, key: 'o/p/7', id: 7, title: 'Not time writing', workItemType: 'Task', parentId: 6, completedWork: 99 },
    { ...base, key: 'o/p/8', id: 8, title: 'CP | Care Pathways | v2.8', workItemType: 'Feature', parentId: 1 },
  ]
  const scopes = [{ release: 'CP | Care Pathways | v3.1', stream: 'cp', history: [{ at: '2026-09-01T00:00:00Z', drivers: { assets: 8 } }, { at: '2026-10-14T00:00:00Z', drivers: { assets: 10 }, reason: '+2 assets' }] }]
  const rows = releaseBaselines(items, exampleBaselineRules, scopes)
  assert.equal(rows.length, 2)
  const v31 = rows.find((row) => row.feature.id === 2)
  assert.deepEqual([v31.original.total, v31.current.total, v31.growth, v31.actual, v31.variance], [204, 248, 44, 270, 22])
  const v28 = rows.find((row) => row.feature.id === 8)
  assert.deepEqual([v28.scope, v28.current, v28.actual, v28.variance], [undefined, undefined, 0, null])
})

import { sampleDataset, sampleReleaseScopes } from '../src/sampleData.ts'
test('sample scopes match sample releases and show a CP re-baseline', () => {
  const { items } = sampleDataset({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const rows = releaseBaselines(items, exampleBaselineRules, normalizeScopes(sampleReleaseScopes('2026-10')))
  assert.equal(rows.filter((row) => row.scope).length, 5, 'every sample scope finds its Feature')
  const cp = rows.find((row) => row.feature.title === 'CP | Care Pathways | v3.1')
  assert.deepEqual([cp.original.total, cp.current.total, cp.growth], [204, 248, 44])
  const svc = rows.find((row) => row.stream === 'Serviceability')
  assert.deepEqual([svc.original.total, svc.current.total, svc.current.capped], [44, 60, true])
  assert.ok(rows.every((row) => row.actual >= 0))
})
