import test from 'node:test'
import assert from 'node:assert/strict'
import { capacityModel, absenceKind, loadStatus, normalizeCapacitySettings, defaultCapacitySettings } from '../src/capacity.ts'

const item = (id, extra = {}) => ({ key: `org/project/${id}`, id, title: 'Release - Time Writing', workItemType: 'User Story', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'project', syncedAt: '', ...extra })
// Two streams (Epics 1 and 2) plus the absence Epic 900 with a per-person PTO / Sick Feature.
const backlog = [
  item(1, { workItemType: 'Epic', title: 'Stream A' }), item(2, { workItemType: 'Epic', title: 'Stream B' }), item(900, { workItemType: 'Epic', title: 'Absence' }),
  item(10, { workItemType: 'Feature', parentId: 1, title: 'Release 1' }), item(11, { workItemType: 'Feature', parentId: 2, title: 'Release 2' }),
  item(20, { parentId: 10 }), item(21, { parentId: 11 }),
  item(30, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Release 1', assignedTo: 'Ana', originalEstimate: 100, completedWork: 120 }),
  item(31, { workItemType: 'Task', parentId: 21, title: 'October 2026 | Release 2', assignedTo: 'Ana', originalEstimate: 20, completedWork: 40 }),
  item(32, { workItemType: 'Task', parentId: 21, title: 'October 2026 | Release 2', assignedTo: 'Ben', originalEstimate: 60, completedWork: 50 }),
  item(33, { workItemType: 'Task', parentId: 21, title: 'September 2026 | Release 2', assignedTo: 'Ben', completedWork: 999 }),
  item(40, { workItemType: 'Feature', parentId: 900, title: 'Ana - PTO', assignedTo: 'Ana' }), item(41, { parentId: 40, title: 'Ana - Time Writing' }),
  item(42, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - PTO', assignedTo: 'Ana', completedWork: 16 }),
  item(43, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - Sick leave', assignedTo: 'Ana', completedWork: 8 }),
  item(50, { workItemType: 'Task', parentId: 21, title: 'October 2026 | Removed', state: 'Removed', assignedTo: 'Ben', completedWork: 500 }),
]
const settings = { ...defaultCapacitySettings, absenceEpicId: 900 }

test('per-person load deducts absence from funded hours and classifies utilization', () => {
  const model = capacityModel(backlog, '2026-10', settings)
  assert.equal(model.workingDays, 22); assert.equal(model.fundedPerPerson, 176)
  const ana = model.people.find((person) => person.name === 'Ana'), ben = model.people.find((person) => person.name === 'Ben')
  assert.equal(ana.absence, 24); assert.equal(ana.absenceByKind.PTO, 16); assert.equal(ana.absenceByKind['Sick Leave'], 8)
  assert.equal(ana.available, 152); assert.equal(ana.work, 160); assert.equal(ana.planned, 120)
  assert.equal(ana.utilization, 105.26); assert.equal(ana.status, 'Overloaded')
  assert.equal(ben.absence, 0); assert.equal(ben.work, 50); assert.equal(ben.utilization, 28.41); assert.equal(ben.status, 'Has capacity')
  assert.equal(model.people[0].name, 'Ana', 'sorted by utilization descending')
  assert.deepEqual(model.counts, { overloaded: 1, balanced: 0, hasCapacity: 1, noBookings: 0 })
})
test('streams are Epics with hours, people and feature counts; absence is not a stream', () => {
  const model = capacityModel(backlog, '2026-10', settings)
  assert.deepEqual(model.streams.map((stream) => [stream.title, stream.work, stream.planned, stream.people, stream.features]), [['Stream A', 120, 100, 1, 1], ['Stream B', 90, 80, 2, 1]])
  assert.equal(model.streams[0].share, 57.14)
  const ana = model.people.find((person) => person.name === 'Ana')
  assert.deepEqual(ana.streams.map((stream) => [stream.title, stream.work]), [['Stream A', 120], ['Stream B', 40]])
  assert.equal(model.totals.work, 210); assert.equal(model.totals.absence, 24); assert.equal(model.totals.funded, 352); assert.equal(model.totals.available, 328)
  assert.equal(model.totals.utilization, 64.02)
})
test('absence kinds are read from task and ancestor titles', () => {
  assert.equal(absenceKind(['October 2026 | Ana', 'Ana - PTO']), 'PTO')
  assert.equal(absenceKind(['Vacation']), 'PTO'); assert.equal(absenceKind(['Sick day']), 'Sick Leave')
  assert.equal(absenceKind(['Unplanned leave', 'Ana - PTO']), 'Unplanned Leave'); assert.equal(absenceKind(['Something else']), 'Other absence')
})
test('status thresholds and settings normalisation', () => {
  assert.equal(loadStatus(null, defaultCapacitySettings), 'No bookings'); assert.equal(loadStatus(100, defaultCapacitySettings), 'Overloaded')
  assert.equal(loadStatus(79.9, defaultCapacitySettings), 'Has capacity'); assert.equal(loadStatus(80, defaultCapacitySettings), 'Balanced')
  assert.deepEqual(normalizeCapacitySettings(undefined), defaultCapacitySettings)
  assert.deepEqual(normalizeCapacitySettings({ absenceEpicId: '123', hoursPerDay: 7.5, overloadedAt: 110, availableBelow: 70 }), { absenceEpicId: 123, hoursPerDay: 7.5, overloadedAt: 110, availableBelow: 70 })
  assert.deepEqual(normalizeCapacitySettings({ overloadedAt: 50, availableBelow: 90 }), defaultCapacitySettings, 'inverted thresholds fall back')
  assert.throws(() => capacityModel([], '2026-13'))
})
test('people without month tasks are absent from the model and no-bookings only applies to absence-only people', () => {
  const model = capacityModel([item(900, { workItemType: 'Epic' }), item(40, { workItemType: 'Feature', parentId: 900, title: 'Cy - PTO' }), item(41, { parentId: 40, title: 'Cy - Time Writing' }), item(42, { workItemType: 'Task', parentId: 41, title: 'October 2026 | PTO', assignedTo: 'Cy', completedWork: 8 })], '2026-10', settings)
  assert.equal(model.people.length, 1); assert.equal(model.people[0].status, 'No bookings'); assert.equal(model.people[0].utilization, null); assert.equal(model.totals.utilization, null)
})
