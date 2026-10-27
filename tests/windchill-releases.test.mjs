import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseFromDocumentName, releasesFromDocumentName, releaseFromLocation, locationColumn, windchillReleases, windchillLocationsFile, documentNameColumn } from '../src/windchillReleases.ts'

test('a document name splits at its first version: release name, release number, document name', () => {
  assert.deepEqual(releaseFromDocumentName('Remote Diagnostics 1.6 Verification Report'), { name: 'Remote Diagnostics', release: '1.6', document: 'Verification Report' })
  assert.deepEqual(releaseFromDocumentName('IntelliSpace Portal - v12.1 - Test Plan'), { name: 'IntelliSpace Portal', release: '12.1', document: 'Test Plan' })
  assert.deepEqual(releaseFromDocumentName('CareLink_R3.2_SRS'), { name: 'CareLink', release: '3.2', document: 'SRS' })
  assert.deepEqual(releaseFromDocumentName('Field Service Tool Release 5 Release Notes'), { name: 'Field Service Tool', release: '5', document: 'Release Notes' })
  assert.deepEqual(releaseFromDocumentName('Dose Viewer | 3.0.0.2 | DHF Index (v2)'), { name: 'Dose Viewer', release: '3.0.0.2', document: 'DHF Index (v2)' }, 'a version in brackets is the document revision')
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

test('clubbed names: every name + release pair is a release, whatever the delimiters; the rest is the document name', () => {
  const pairs = (text) => releasesFromDocumentName(text).map((entry) => `${entry.name} ${entry.release} | ${entry.document}`)
  assert.deepEqual(pairs('Service1_rel1.0_Service2_rel2.3_Test Plan'), ['Service1 1.0 | Test Plan', 'Service2 2.3 | Test Plan'])
  assert.deepEqual(pairs('Service1_rel1_service2_rel2'), ['Service1 1 | ', 'service2 2 | '])
  assert.deepEqual(pairs('Remote Diagnostics 1.6 - CareLink v3.2 ; Verification Report'), ['Remote Diagnostics 1.6 | Verification Report', 'CareLink 3.2 | Verification Report'])
  assert.deepEqual(pairs('Field Tool|R2.1|Portal|R4.0.1|SRS'), ['Field Tool 2.1 | SRS', 'Portal 4.0.1 | SRS'])
  assert.deepEqual(pairs('Viewer 1.6 & 1.7 SRS'), ['Viewer 1.6 | SRS', 'Viewer 1.7 | SRS'], 'a version with no name before it keeps the previous name')
  assert.deepEqual(pairs('Viewer_1.6_and_2.0_Test Report'), ['Viewer 1.6 | Test Report', 'Viewer 2.0 | Test Report'])
  assert.deepEqual(pairs('Service2 rel2 + Service3 Release 3 DHF Index (v4)'), ['Service2 2 | DHF Index (v4)', 'Service3 3 | DHF Index (v4)'])
})

test('a clubbed document counts once for each release it names', () => {
  const rows = [
    { Name: 'Service1_rel1.0_Service2_rel2.3_Test Plan', Modified: '2026-10-02' },
    { Name: 'Service1-1.0-SRS', Modified: '2026-10-05' },
    { Name: 'service2 v2.3.0 Verification Report', Modified: '2026-09-01' },
  ]
  const { releases, clubbed } = windchillReleases(rows, ['Name', 'Modified'])
  assert.equal(clubbed, 1)
  assert.deepEqual(releases.map((entry) => [entry.name, entry.release, entry.documents.map((doc) => doc.name), entry.latest]), [['Service1', '1.0', ['Test Plan', 'SRS'], '2026-10-05'], ['Service2', '2.3', ['Test Plan', 'Verification Report'], '2026-10-02']])
})

test('Location: the release is read from the deepest folder that holds a version, in one folder or in name/version folders (CON-72)', () => {
  const read = (location) => { const found = releaseFromLocation(location); return found ? `${found.name} ${found.release} @ ${found.folder}` : undefined }
  assert.equal(read('/Products/Remote Diagnostics 1.6/DHF'), 'Remote Diagnostics 1.6 @ Products/Remote Diagnostics 1.6')
  assert.equal(read('/Products/Remote Diagnostics/1.7/Design Inputs'), 'Remote Diagnostics 1.7 @ Products/Remote Diagnostics/1.7')
  assert.equal(read('/Products/CareLink/R3.2/DHF'), 'CareLink 3.2 @ Products/CareLink/R3.2')
  assert.equal(read('\\Products\\IntelliSpace Portal - v12.1\\Test Reports'), 'IntelliSpace Portal 12.1 @ Products/IntelliSpace Portal - v12.1')
  assert.equal(read('/Products/Viewer 2.0/Patches/2.0.3/DHF'), 'Patches 2.0.3 @ Products/Viewer 2.0/Patches/2.0.3', 'the deepest version wins, with the folder above it as the name')
  assert.equal(read('/Quality/Manuals'), undefined)
  assert.equal(read(''), undefined)
  assert.equal(locationColumn(['Number', 'Name', 'Location']), 'Location')
  assert.equal(locationColumn(['Number', 'Folder Path']), 'Folder Path')
  assert.equal(locationColumn(['Number', 'Name']), undefined)
})

test('Location source: unique releases and unique locations of an export, with the names as fallback', () => {
  const rows = [
    { Number: 'D1', Name: 'Verification Report', Location: '/Products/Remote Diagnostics 1.6/DHF', 'Last Modified': '2026-09-02' },
    { Number: 'D2', Name: 'Test Plan', Location: '/Products/Remote Diagnostics 1.6/DHF', 'Last Modified': '2026-10-01' },
    { Number: 'D3', Name: 'SRS', Location: '/Products/Remote Diagnostics/1.7/Design Inputs', 'Last Modified': '2026-10-03' },
    { Number: 'D4', Name: 'CareLink_R3.2_SRS', Location: '/Products/CareLink/R3.2/DHF', 'Last Modified': '2026-08-01' },
    { Number: 'D5', Name: 'Quality Manual', Location: '/Quality/Manuals', 'Last Modified': '2026-08-01' },
  ]
  const columns = ['Number', 'Name', 'Location', 'Last Modified']
  const result = windchillReleases(rows, columns)
  assert.equal(result.source, 'location'); assert.equal(result.locationColumn, 'Location')
  assert.deepEqual(result.releases.map((entry) => [entry.name, entry.release, entry.documents.map((doc) => doc.name), entry.locations]), [
    ['CareLink', '3.2', ['CareLink_R3.2_SRS'], ['/Products/CareLink/R3.2/DHF']],
    ['Remote Diagnostics', '1.7', ['SRS'], ['/Products/Remote Diagnostics/1.7/Design Inputs']],
    ['Remote Diagnostics', '1.6', ['Verification Report', 'Test Plan'], ['/Products/Remote Diagnostics 1.6/DHF']],
  ])
  assert.deepEqual(result.unmatched, ['/Quality/Manuals'])
  assert.deepEqual(result.locations.map((entry) => [entry.location, entry.count, entry.release?.release]), [['/Products/Remote Diagnostics 1.6/DHF', 2, '1.6'], ['/Products/CareLink/R3.2/DHF', 1, '3.2'], ['/Products/Remote Diagnostics/1.7/Design Inputs', 1, '1.7'], ['/Quality/Manuals', 1, undefined]])
  const byName = windchillReleases(rows, columns, { source: 'name' })
  assert.equal(byName.source, 'name')
  assert.deepEqual(byName.releases.map((entry) => `${entry.name} ${entry.release}`), ['CareLink 3.2'])
  assert.equal(windchillReleases(rows, ['Number', 'Name', 'Last Modified']).source, 'name', 'no Location column: the names are used')
  const file = windchillLocationsFile({ id: 'ssit', name: 'S&S IT' }, result, rows.length, '2026-10-27T06:30:00.000Z')
  assert.deepEqual(Object.keys(file), ['schema', 'kind', 'viewId', 'export', 'column', 'generatedAt', 'documents', 'locations', 'releases'])
  assert.equal(file.kind, 'windchill-locations'); assert.equal(file.documents, 5); assert.equal(file.locations.length, 4)
  assert.deepEqual(file.releases[2], { name: 'Remote Diagnostics', release: '1.6', documents: 2, locations: ['/Products/Remote Diagnostics 1.6/DHF'] })
  assert.equal(JSON.stringify(file).includes('"row"'), false, 'the analysis file holds no document rows')
})
