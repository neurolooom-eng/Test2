import test from 'node:test'
import assert from 'node:assert/strict'
import { parseUsageRecord, recordUsage, serializeUsage, usageFileName, usageSummary } from '../src/usageLog.ts'
import { defaultPolicy, parseAccess, serializeAccess } from '../src/access.ts'

// Usage log (CON-73, CON-74): one record per person in usage/<email>.json, one commit a day at most, summarised per
// person and per month; recording switched off through access.json.

test('a record names the file by the email, holds the days used, and is written at most once a day', () => {
  assert.equal(usageFileName('Dana.Example@Company.com'), 'usage/dana.example_at_company.com.json')
  assert.equal(usageFileName('  '), '')
  const first = recordUsage(null, { email: 'Dana@Example.com', today: '2026-10-27', version: '1.2.2', platform: 'web' })
  assert.equal(first.changed, true)
  assert.deepEqual(first.record, { schema: 1, email: 'dana@example.com', firstSeen: '2026-10-27', lastSeen: '2026-10-27', days: ['2026-10-27'], version: '1.2.2', platform: 'web' })
  assert.deepEqual(recordUsage(first.record, { email: 'dana@example.com', today: '2026-10-27', version: '1.2.2', platform: 'web' }), { record: first.record, changed: false }, 'the same day again: nothing to write')
  const later = recordUsage(first.record, { email: 'dana@example.com', today: '2026-10-29', version: '1.2.3', platform: 'desktop' })
  assert.equal(later.changed, true)
  assert.deepEqual(later.record.days, ['2026-10-27', '2026-10-29']); assert.equal(later.record.firstSeen, '2026-10-27'); assert.equal(later.record.lastSeen, '2026-10-29'); assert.equal(later.record.version, '1.2.3'); assert.equal(later.record.platform, 'desktop')
  const parsed = parseUsageRecord(serializeUsage(later.record))
  assert.deepEqual(parsed, later.record)
  assert.deepEqual(parseUsageRecord('{"schema":1,"email":"a@b.co","days":["2026-10-01","bad","2026-09-30","2026-10-01"]}').days, ['2026-09-30', '2026-10-01'], 'bad days dropped, duplicates merged, sorted')
  assert.throws(() => parseUsageRecord('{"schema":1,"email":"nobody","days":[]}'), /not a usage record/)
  assert.throws(() => parseUsageRecord('nope'), /not valid JSON/)
  assert.equal(serializeUsage(later.record).includes('token'), false)
})

test('the summary gives active people in the last 7 and 30 days, newest first, and person-days per month', () => {
  const records = [
    { schema: 1, email: 'a@x.com', firstSeen: '2026-09-01', lastSeen: '2026-10-27', days: ['2026-09-01', '2026-10-20', '2026-10-27'], version: '1.2.2', platform: 'web' },
    { schema: 1, email: 'b@x.com', firstSeen: '2026-10-01', lastSeen: '2026-10-05', days: ['2026-10-01', '2026-10-05'], version: '1.2.1', platform: 'desktop' },
    { schema: 1, email: 'c@x.com', firstSeen: '2026-08-15', lastSeen: '2026-08-15', days: ['2026-08-15'], version: '1.2.0', platform: 'web' },
  ]
  const summary = usageSummary(records, '2026-10-27')
  assert.deepEqual(summary.people.map((person) => [person.email, person.daysUsed, person.last7, person.last30]), [['a@x.com', 3, 1, 2], ['b@x.com', 2, 0, 2], ['c@x.com', 1, 0, 0]], '2026-10-20 is 7 days before: outside the last 7 days')
  assert.equal(summary.active7, 1); assert.equal(summary.active30, 2)
  assert.deepEqual(summary.byMonth, [{ month: '2026-10', people: 2, days: 4 }, { month: '2026-09', people: 1, days: 1 }, { month: '2026-08', people: 1, days: 1 }])
})

test('access.json carries the usage-log switch: on unless set to false, kept through a round trip', () => {
  const policy = defaultPolicy('admin@x.com')
  assert.equal(policy.usageLog, true)
  assert.equal(parseAccess(serializeAccess(policy)).usageLog, true)
  assert.equal(parseAccess(serializeAccess({ ...policy, usageLog: false })).usageLog, false)
  assert.equal(parseAccess('{"schema":1,"roles":{},"members":{}}').usageLog, true, 'an older file without the switch records')
})
