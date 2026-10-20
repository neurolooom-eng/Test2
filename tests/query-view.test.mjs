import test from 'node:test'
import assert from 'node:assert/strict'
import { queryLayout, pickFields, cellValue, columnName, formatCell, sortItems, viewSummary, viewCsv, defaultViewColumns } from '../src/queryView.ts'

const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: 'Ana', areaPath: 'p\\DP', iterationPath: 'p\\S1', tags: '', url: 'u', syncedAt: '' }
const item = (id, extra = {}) => ({ ...base, key: `o/p/${id}`, id, workItemType: 'User Story', title: `Item ${id}`, ...extra })

test('query layout: SELECT columns in order, ORDER BY with direction; ID-only or no query uses defaults', () => {
  const wiql = 'SELECT [System.Id], [System.Title], [Custom.AuthorApprovalDate], [System.State]\nFROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [Custom.AuthorApprovalDate] DESC, [System.Id]'
  assert.deepEqual(queryLayout(wiql), { columns: ['System.Id', 'System.Title', 'Custom.AuthorApprovalDate', 'System.State'], orderBy: [{ ref: 'Custom.AuthorApprovalDate', desc: true }, { ref: 'System.Id', desc: false }] })
  assert.deepEqual(queryLayout('SELECT [System.Id] FROM WorkItems WHERE [System.State] <> \'Removed\'').columns, defaultViewColumns)
  assert.deepEqual(queryLayout(undefined), { columns: defaultViewColumns, orderBy: [] })
})

test('fields: identities become display names; standard columns fall back to the mapped item; names readable', () => {
  assert.deepEqual(pickFields({ 'System.AssignedTo': { displayName: 'Ana Costa', uniqueName: 'ana@x' }, 'Custom.Docs': 14, 'System.Title': 'T', other: 'x' }, ['System.AssignedTo', 'Custom.Docs', 'System.Title', 'Missing']), { 'System.AssignedTo': 'Ana Costa', 'Custom.Docs': 14, 'System.Title': 'T' })
  const row = item(7, { fields: { 'Custom.Docs': 3 } })
  assert.equal(cellValue(row, 'Custom.Docs'), 3); assert.equal(cellValue(row, 'System.Title'), 'Item 7'); assert.equal(cellValue(row, 'Custom.Unknown'), undefined)
  assert.equal(columnName('Custom.AuthorApprovalDate'), 'Author Approval Date'); assert.equal(columnName('Custom.X', { 'Custom.X': 'Azure Name' }), 'Azure Name'); assert.equal(columnName('System.AssignedTo'), 'Assigned To')
  assert.equal(formatCell('2026-10-12T00:00:00Z'), '2026-10-12'); assert.equal(formatCell(true), 'Yes'); assert.equal(formatCell(undefined), '')
})

test('sorting follows the query order; blanks last; numbers numeric', () => {
  const rows = [item(1, { fields: { n: 10 } }), item(2, { fields: { n: 9 } }), item(3)]
  assert.deepEqual(sortItems(rows, [{ ref: 'n', desc: false }]).map((row) => row.id), [2, 1, 3])
  assert.deepEqual(sortItems(rows, [{ ref: 'n', desc: true }]).map((row) => row.id), [3, 1, 2])
  assert.equal(sortItems(rows, []), rows)
})

test('summary: counts by state, type and person; overdue open items; changed this week; CSV export', () => {
  const rows = [
    item(1, { state: 'Active', targetDate: '2026-10-01', changedDate: '2026-10-19T10:00:00Z' }),
    item(2, { state: 'Closed', targetDate: '2026-10-01', assignedTo: '' }),
    item(3, { state: 'Active', workItemType: 'Bug', changedDate: '2026-09-01T10:00:00Z' }),
  ]
  const summary = viewSummary(rows, '2026-10-20')
  assert.deepEqual(summary.byState, [['Active', 2], ['Closed', 1]]); assert.deepEqual(summary.byType, [['User Story', 2], ['Bug', 1]])
  assert.deepEqual(summary.byPerson, [['Ana', 2], ['Unassigned', 1]]); assert.equal(summary.overdue, 1); assert.equal(summary.changedThisWeek, 1)
  assert.equal(viewCsv([item(5, { title: 'A, "b"' })], [{ ref: 'System.Id', name: 'ID' }, { ref: 'System.Title', name: 'Title' }]), 'ID,Title\r\n5,"A, ""b"""')
})
