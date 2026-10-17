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
