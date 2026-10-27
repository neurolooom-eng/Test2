import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseFromDocumentName, windchillReleases, documentNameColumn } from '../src/windchillReleases.ts'

test('a document name splits at its first version: release name, release number, document name', () => {
  assert.deepEqual(releaseFromDocumentName('Remote Diagnostics 1.6 Verification Report'), { name: 'Remote Diagnostics', release: '1.6', document: 'Verification Report' })
  assert.deepEqual(releaseFromDocumentName('IntelliSpace Portal - v12.1 - Test Plan'), { name: 'IntelliSpace Portal', release: '12.1', document: 'Test Plan' })
  assert.deepEqual(releaseFromDocumentName('CareLink_R3.2_SRS'), { name: 'CareLink', release: '3.2', document: 'SRS' })
  assert.deepEqual(releaseFromDocumentName('Field Service Tool Release 5 Release Notes'), { name: 'Field Service Tool', release: '5', document: 'Release Notes' })
  assert.deepEqual(releaseFromDocumentName('Dose Viewer | 3.0.0.2 | DHF Index (v2)'), { name: 'Dose Viewer', release: '3.0.0.2', document: 'DHF Index (v2)' }, 'only the first version splits')
  assert.equal(releaseFromDocumentName('Quality Manual'), undefined, 'no version: no release')
  assert.equal(releaseFromDocumentName('2.1 Test Plan'), undefined, 'a version with no name before it: no release')
  assert.equal(releaseFromDocumentName('Plan for 2026 audits'), undefined, 'a lone number is not a version')
})

test('unique releases from an export: name + number, case and trailing zeros ignored; documents and latest date kept', () => {
  const rows = [
    { Number: 'D1', Name: 'Remote Diagnostics 1.6 Verification Report', 'Last Modified': '2026-09-02' },
    { Number: 'D2', Name: 'remote diagnostics 1.6.0 - Test Plan', 'Last Modified': '2026-10-01' },
    { Number: 'D3', Name: 'Remote Diagnostics 1.7 SRS', 'Last Modified': '2026-10-03' },
    { Number: 'D4', Name: 'CareLink_R3.2_SRS', 'Last Modified': '2026-08-01' },
    { Number: 'D5', Name: 'Quality Manual', 'Last Modified': '2026-08-01' },
  ]
  const { releases, unmatched, nameColumn, dateColumn } = windchillReleases(rows, ['Number', 'Name', 'Last Modified'])
  assert.equal(nameColumn, 'Name'); assert.equal(dateColumn, 'Last Modified')
  assert.deepEqual(releases.map((entry) => [entry.name, entry.release, entry.documents.length, entry.latest]), [['CareLink', '3.2', 1, '2026-08-01'], ['Remote Diagnostics', '1.7', 1, '2026-10-03'], ['Remote Diagnostics', '1.6', 2, '2026-10-01']])
  assert.deepEqual(releases[2].documents.map((entry) => entry.name), ['Verification Report', 'Test Plan'])
  assert.deepEqual(unmatched, ['Quality Manual'])
  assert.equal(documentNameColumn(['Number', 'Organization Name', 'Document Name']), 'Document Name')
})
