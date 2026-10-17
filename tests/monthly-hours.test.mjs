import test from 'node:test'
import assert from 'node:assert/strict'
import { monthlyHours, capacityModel } from '../src/capacity.ts'
import { sampleDataset } from '../src/sampleData.ts'

test('monthly hours series spans the requested months and matches the capacity model per month', () => {
  const { items } = sampleDataset({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const series = monthlyHours(items, '2026-10', 12)
  assert.equal(series.length, 12); assert.equal(series[0].month, '2025-11'); assert.equal(series.at(-1).month, '2026-10')
  const october = capacityModel(items, '2026-10')
  assert.deepEqual([series.at(-1).funded, series.at(-1).available, series.at(-1).actual], [october.totals.funded, october.totals.available, october.totals.work])
  assert.ok(series.slice(0, 6).every((point) => point.actual == null && point.funded == null), 'months without tasks are gaps')
  assert.ok(series.slice(6).every((point) => point.actual != null && point.funded >= point.available && point.available >= point.actual * 0.5))
  assert.throws(() => monthlyHours(items, '2026-13'))
  assert.equal(monthlyHours(items, '2026-10', 6).length, 6)
})

import { epicColors, niceTicks, columnPath, barPath } from '../src/chartUtils.ts'
test('monthly series carries utilization and per-Epic hours that reconcile with the totals', () => {
  const { items } = sampleDataset({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const october = monthlyHours(items, '2026-10', 12).at(-1)
  assert.equal(october.utilization, capacityModel(items, '2026-10').totals.utilization)
  assert.ok(Math.abs(october.plannedUtilization - october.planned / october.available * 100) < 0.01)
  assert.ok(Math.abs(october.streams.reduce((sum, stream) => sum + stream.work, 0) - october.actual) < 0.001, 'Epic hours add up to booked hours')
  assert.equal(monthlyHours(items, '2026-10', 12)[0].utilization, null)
})
test('Epic colours: top five by booked hours keep slots 1–5, the rest fold into Other', () => {
  const series = [{ streams: [{ key: 'a', title: 'A', work: 10, planned: 0 }, { key: 'b', title: 'B', work: 50, planned: 0 }] }, { streams: ['c', 'd', 'e', 'f', 'g'].map((key, index) => ({ key, title: key.toUpperCase(), work: 20 - index, planned: 0 })) }]
  const colors = epicColors(series)
  assert.deepEqual(colors.top.map((entry) => entry.key), ['b', 'c', 'd', 'e', 'f'])
  assert.equal(colors.colorOf('b'), 'var(--viz-series-1)'); assert.equal(colors.colorOf('a'), 'var(--viz-other)'); assert.equal(colors.isTop('g'), false)
  assert.deepEqual(epicColors([]).top, [])
})
test('chart geometry helpers', () => {
  assert.deepEqual(niceTicks(964), [0, 250, 500, 750, 1000]); assert.deepEqual(niceTicks(117.3), [0, 50, 100, 150]); assert.deepEqual(niceTicks(0), [0, 1])
  assert.equal(columnPath(0, 0, 10, 0), ''); assert.match(columnPath(10, 20, 24, 100), /^M10,120V24Q10,20 14,20H30Q34,20 34,24V120Z$/)
  assert.match(barPath(0, 0, 50, 16), /^M0,0H46Q50,0 50,4V12Q50,16 46,16H0Z$/)
})
