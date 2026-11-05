import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHistoryFile, matchPeople, monthOfCell, parseHistoryFile, parseHistorySheet, pickHistorySheet, serializeHistory, streamsWithoutEpic, withHistory } from '../src/history.ts'
import { capacityModel } from '../src/capacity.ts'
import { personMonths } from '../src/dashboard.ts'

// Synthetic planning workbook rows (no company data): the TransformedData layout, one row per person × month × activity.
const header = ['Stream(Features)', 'Migration?', 'Epic No', 'Epic Name', 'Project / Release Title', 'Service/Project/Release', 'Project / Release Type', 'Current Milestone', 'QA/QE', 'Region', 'Month', 'Expected', 'Actual', 'Month(Date)', 'Total Working Hours', 'Role']
const row = (stream, epic, title, person, date, expected, actual) => [stream, '', epic, 'TBD', title, 'Release', '', '', person, 'BLR', '', expected, actual, date, '168', 'QE']
const sheet = [
  header,
  row('Projects - Alpha', '500', 'Alpha 1.0', 'Ana Costa', '2026-05-01', '10', '12'),
  row('CAPA', '', 'CAPA 12', 'Ben Ode', '2026-06-01', '', '8'),
  row('CAPA', '0', 'CAPA 13', 'Ben Ode', '2026-07-01', '5', ''),
  row('Projects - Alpha', '500', 'Alpha 1.0', 'Ana Costa', '2026-10-01', '10', '10'),
  row('Projects - Alpha', '500', 'Alpha 1.0', '#N/A', '2026-05-01', '4', '4'),
  row('Projects - Alpha', '500', 'Alpha 1.0', 'Cleo Dunn', '2026-05-01', '0', '0'),
  row('Projects - Alpha', '500', 'Alpha 1.0', 'Cleo Dunn', 'May', '3', '3'),
]

test('historical hours: the TransformedData sheet read before the cut-off; every other row listed with its reason (HIS-02, HIS-03)', () => {
  assert.equal(monthOfCell('2026-05-01'), '2026-05')
  assert.equal(monthOfCell('2026-05-01 00:00'), '2026-05')
  assert.equal(monthOfCell('01.09.2026'), '2026-09')
  assert.equal(monthOfCell('May'), undefined, 'a month name without a year is not a month')
  assert.equal(pickHistorySheet([{ name: 'Cover', rows: [['QE Capacity']] }, { name: 'TransformedData', rows: sheet }]).name, 'TransformedData')
  const parsed = parseHistorySheet(sheet, '2026-10')
  assert.deepEqual(parsed.rows, [
    { person: 'Ana Costa', month: '2026-05', epicId: 500, stream: 'Projects - Alpha', activity: 'Alpha 1.0', type: 'Release', planned: 10, actual: 12 },
    { person: 'Ben Ode', month: '2026-06', stream: 'CAPA', activity: 'CAPA 12', type: 'Release', actual: 8 },
    { person: 'Ben Ode', month: '2026-07', stream: 'CAPA', activity: 'CAPA 13', type: 'Release', planned: 5 },
  ])
  assert.deepEqual(parsed.skipped.map((entry) => [entry.row, entry.reason]), [[5, '2026-10: from the cut-off on, Azure DevOps counts'], [6, 'no person'], [7, 'no hours'], [8, 'no month (Month(Date) is not a date)']])
  assert.deepEqual(streamsWithoutEpic(parsed.rows), [{ stream: 'CAPA', count: 2 }])
  assert.throws(() => parseHistorySheet([['Name', 'Hours']]), /No header row/)
})

test('historical hours: Excel names matched to Azure DevOps names in any order; ambiguous or unknown names stay as written (HIS-06)', () => {
  const known = ['Costa, Ana <ana.costa@example.com>', 'Ode, Ben', 'Ode, Bea', 'Dunn, Cleo']
  assert.deepEqual(matchPeople(['Ana Costa', 'Ben Ode', 'Cleo', 'Ode', 'Dan Eve'], known), { 'Ana Costa': 'Costa, Ana <ana.costa@example.com>', 'Ben Ode': 'Ode, Ben', 'Cleo': 'Dunn, Cleo' })
})

test('historical hours: the Git file keeps known shapes only (HIS-04)', () => {
  const file = buildHistoryFile({ rows: parseHistorySheet(sheet, '2026-10').rows, cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: 'lead@example.com', streamEpics: { CAPA: 600 }, people: { 'Ana Costa': 'Costa, Ana' } }, '2026-11-05T10:00:00Z')
  assert.deepEqual(parseHistoryFile(serializeHistory(file)), file, 'a round trip keeps everything')
  assert.equal(parseHistoryFile('{"schema":1,"kind":"history-hours","cutoff":"Oct","rows":[]}'), null, 'a bad cut-off: no history')
  assert.equal(parseHistoryFile('not json'), null)
  const planted = parseHistoryFile(JSON.stringify({ ...file, rows: [...file.rows, { person: '', month: '2026-05', actual: 5 }, { person: 'X', month: '2026-05', actual: 1e9 }, 'row'], streamEpics: { CAPA: 'six hundred' }, people: { 'Ana Costa': 7 } }))
  assert.equal(planted.rows.length, 4, 'rows without a person dropped; absurd hours dropped from the row')
  assert.equal(planted.rows[3].actual, undefined)
  assert.deepEqual([planted.streamEpics, planted.people], [{}, {}])
})

test('historical hours in the reports: before the cut-off the history only, from it Azure DevOps only; real Epics and mapped streams used (HIS-05, HIS-07)', () => {
  const base = { organization: 'org', project: 'Quality', state: 'Active', areaPath: 'Quality', iterationPath: 'Quality', tags: '', url: '', syncedAt: '' }
  const item = (id, workItemType, title, extra = {}) => ({ ...base, key: `org/quality/${id}`, id, workItemType, title, assignedTo: '', ...extra })
  const ado = [
    item(500, 'Epic', 'Alpha stream'), item(600, 'Epic', 'CAPA stream'),
    item(501, 'Feature', 'Alpha 1.0', { parentId: 500 }),
    item(502, 'Task', 'May 2026 | Alpha', { parentId: 501, assignedTo: 'Costa, Ana', originalEstimate: 99, completedWork: 99 }),
    item(503, 'Task', 'October 2026 | Alpha', { parentId: 501, assignedTo: 'Costa, Ana', originalEstimate: 20, completedWork: 18 }),
  ]
  const file = buildHistoryFile({ rows: parseHistorySheet(sheet, '2026-10').rows, cutoff: '2026-10', source: 'plan.xlsx', sheet: 'TransformedData', importedBy: '', streamEpics: { CAPA: 600 }, people: { 'Ana Costa': 'Costa, Ana' } })
  const merged = withHistory(ado, file)
  assert.equal(withHistory(ado, file), merged, 'worked out once per data set')
  assert.deepEqual(merged.leftOut, { tasks: 1, hours: 99 }, 'the Azure DevOps May Task (test data) is not counted')
  assert.deepEqual(merged.added, { rows: 3, hours: 20, people: 2 })
  assert.ok(merged.items.filter((entry) => entry.id < 0).every((entry) => entry.organization === 'history' && entry.state === 'Closed'), 'read-only stand-ins with negative IDs')
  const may = capacityModel(merged.items, '2026-05')
  assert.deepEqual(may.people.map((person) => [person.name, person.work, person.planned]), [['Costa, Ana', 12, 10]], 'May: the history under the Azure DevOps name, not the 99h test Task')
  assert.deepEqual(may.streams.map((stream) => [stream.title, stream.work]), [['Alpha stream', 12]], 'Epic No 500 is the real Epic')
  const june = capacityModel(merged.items, '2026-06')
  assert.deepEqual(june.people.map((person) => [person.name, person.work]), [['Ben Ode', 8]], 'a leaver keeps the Excel name')
  assert.deepEqual(june.streams.map((stream) => stream.title), ['CAPA stream'], 'the CAPA stream mapped to its Epic')
  const october = capacityModel(merged.items, '2026-10')
  assert.deepEqual(october.people.map((person) => [person.name, person.work]), [['Costa, Ana', 18]], 'from the cut-off: Azure DevOps only')
  const rows = personMonths(merged.items, ['2026-05', '2026-06', '2026-07'], '2026-11-05')
  assert.deepEqual(rows.map((entry) => [entry.month, entry.person, entry.actual, entry.plan]), [['2026-05', 'Costa, Ana', 12, 10], ['2026-06', 'Ben Ode', 8, 0], ['2026-07', 'Ben Ode', 0, 5]])
  // Unmapped stream: its own stand-in Epic named after the stream.
  const own = withHistory(ado, { ...file, streamEpics: {} })
  assert.deepEqual(capacityModel(own.items, '2026-06').streams.map((stream) => stream.title), ['CAPA'])
  assert.equal(withHistory(ado, null).items, ado, 'no history: the Azure DevOps items unchanged')
})
