import test from 'node:test'
import assert from 'node:assert/strict'
import { fieldOf, pedestalFor, pedestalItems } from '../src/dpReleases.ts'

const release = (id, title, fields = {}, extra = {}) => ({ key: `org/dhp/${id}`, id, title, workItemType: 'Release', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'DHP', syncedAt: '', fields, ...extra })

test('Pedestal fields are read by name whatever the reference prefix', () => {
  const item = release(1, 'x', { 'Custom.ReleaseIntent': 'Major', 'Philips.DRPEStatus': 'Done', 'PI': 3, 'Custom.Year': '' })
  assert.equal(fieldOf(item, 'ReleaseIntent'), 'Major')
  assert.equal(fieldOf(item, 'DRPEStatus'), 'Done')
  assert.equal(fieldOf(item, 'PI'), '3')
  assert.equal(fieldOf(item, 'Year'), undefined)
  assert.equal(fieldOf(item, 'Release'), undefined, 'ReleaseIntent is not Release')
})

test('a DHFI release is joined to the Pedestal Releases whose Title names its name and version', () => {
  const pedestal = [
    release(10, 'Patient Monitor 2.1 release', { 'Custom.ReleaseIntent': 'Minor', 'Custom.DRPCDate': '2026-09-01T00:00:00Z' }),
    release(11, 'Patient Monitor 2.10'),
    release(12, 'Patient Monitor 2.1.0 hotfix'),
    release(13, 'Patient Monitor 2.1', {}, { state: 'Removed' }),
    release(14, 'Patient Monitor 2.1', {}, { workItemType: 'Feature' }),
  ]
  const found = pedestalFor('Patient Monitor', '2.1', pedestal)
  assert.deepEqual(found.map((entry) => entry.item.id), [12, 10], 'newest first; 2.10, removed and non-Release items excluded')
  assert.equal(found[1].values.ReleaseIntent, 'Minor')
  assert.equal(found[1].values.DRPCDate, '2026-09-01T00:00:00Z')
  assert.deepEqual(pedestalFor('Other', '2.1', pedestal), [])
})

test('Pedestal items come from the other fetched views, each once', () => {
  const a = release(1, 'A 1.0'), doc = { ...release(2, 'Doc'), workItemType: 'Document' }
  const items = pedestalItems([{ connectionId: 'dp', items: [release(9, 'own')] }, { connectionId: 'dhp', items: [a, doc] }, { connectionId: 'copy', items: [a] }], 'dp')
  assert.deepEqual(items.map((item) => item.id), [1])
})

test('a Pedestal value is found by its column name when the reference name differs', () => {
  const [item] = pedestalItems([{ connectionId: 'dhp', columns: [{ ref: 'Philips.ProgramIncrement', name: 'PI' }], items: [release(1, 'A 1.0', { 'Philips.ProgramIncrement': '26.3' })] }])
  assert.equal(fieldOf(item, 'PI'), '26.3')
})
