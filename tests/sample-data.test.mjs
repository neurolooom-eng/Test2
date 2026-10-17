import test from 'node:test'
import assert from 'node:assert/strict'
import { sampleDataset } from '../src/sampleData.ts'
import { capacityModel } from '../src/capacity.ts'
import { azureInsights } from '../src/azureInsights.ts'
import { releaseRegister } from '../src/releaseSource.ts'

const config = { organization: 'Org', project: 'Quality', team: 'InD Quality' }

test('the synthetic sample is deterministic and exercises every model the pages use', () => {
  const first = sampleDataset(config, '2026-10'), second = sampleDataset(config, '2026-10')
  assert.deepEqual(first.items.map((item) => [item.id, item.originalEstimate, item.completedWork]), second.items.map((item) => [item.id, item.originalEstimate, item.completedWork]))
  assert.equal(new Set(first.items.map((item) => item.key)).size, first.items.length, 'keys are unique')
  assert.ok(first.items.some((item) => item.id === 37778 && item.workItemType === 'Epic'), 'absence Epic uses the default id')
  const capacity = capacityModel(first.items, '2026-10')
  assert.equal(capacity.people.length, 6); assert.ok(capacity.streams.length >= 5)
  assert.ok(capacity.totals.absence > 0); assert.ok(capacity.counts.overloaded + capacity.counts.hasCapacity + capacity.counts.balanced === 6)
  const insights = azureInsights(first.items, '2026-10', '2026-10-17')
  assert.ok(insights.monthlyTasks.length > 10); assert.ok(insights.trend.every((point) => point.plan.value != null)); assert.ok(insights.closures.length > 0)
  const register = releaseRegister(first.releaseSource.items, first.items)
  assert.ok(register.length >= 5); assert.ok(register.some((stream) => stream.releases.some((release) => release.tracked)) && register.some((stream) => stream.releases.some((release) => !release.tracked)))
  assert.equal(first.scope.itemKeys.length, first.items.length)
})
