import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNativeReminderPlan, createNativeReminderReconciler, nativeReminderLimits } from './nativeReminderSchedule.js'

const latest = { startDate: '2024-01-01', endDate: '2024-01-05', periodLength: 5, cycleLength: 28 }
const preferences = { periodEnabled: true, waterEnabled: true, leadDays: 3, waterTimes: ['09:00', '13:00', '17:00'] }

function localDate(year, month, day, hours = 0, minutes = 0) {
  const value = new Date(year, month - 1, day, hours, minutes, 0, 0)
  return value
}

function at(date) { return date.toISOString() }

function candidate(key, id, date, title = 'title', body = 'body') {
  return { key, id, at: at(date), title, body }
}

test('builds future water reminders for confirmed and predicted period days', () => {
  const plan = buildNativeReminderPlan({
    latest,
    cycleLength: 28,
    periodLength: 5,
    preferences,
    now: localDate(2024, 1, 3, 8, 30),
  })

  assert.equal(plan.length, 25)
  assert.equal(plan.find((entry) => entry.key === 'period:2024-01-29').at, at(localDate(2024, 1, 26, 9)))
  assert.deepEqual(plan.slice(0, 3).map(({ key, at: scheduledAt }) => ({ key, at: scheduledAt })), [
    { key: 'water:2024-01-03:09:00', at: at(localDate(2024, 1, 3, 9)) },
    { key: 'water:2024-01-03:13:00', at: at(localDate(2024, 1, 3, 13)) },
    { key: 'water:2024-01-03:17:00', at: at(localDate(2024, 1, 3, 17)) },
  ])
  assert.ok(plan.some((entry) => entry.key === 'water:2024-01-29:09:00' && entry.title.includes('dự đoán')))
  assert.ok(plan.every((entry) => entry.extra.owner === 'day-red' && entry.schedule.at instanceof Date))
  assert.ok(plan.every((entry) => entry.id >= nativeReminderLimits.MIN_NATIVE_ID && entry.id <= nativeReminderLimits.MAX_NATIVE_ID))
})

test('adds one next-period lead reminder at local 09:00', () => {
  const plan = buildNativeReminderPlan({
    latest,
    cycleLength: 28,
    periodLength: 5,
    preferences,
    now: localDate(2024, 1, 26, 8),
  })
  const lead = plan.find((entry) => entry.key === 'period:2024-01-29')
  assert.ok(lead)
  assert.equal(lead.at, at(localDate(2024, 1, 26, 9)))
  assert.equal(plan.filter((entry) => entry.key.startsWith('period:')).length, 1)
})

test('catches up a missed lead time once and suppresses a fired prior lead', () => {
  const now = localDate(2024, 1, 27, 10)
  const catchUp = buildNativeReminderPlan({ latest, cycleLength: 28, periodLength: 5, preferences, now })
  const lead = catchUp.find((entry) => entry.key === 'period:2024-01-29')
  assert.equal(lead.at, at(new Date(now.getTime() + 5_000)))

  const fired = buildNativeReminderPlan({
    latest,
    cycleLength: 28,
    periodLength: 5,
    preferences,
    now,
    previous: [candidate('period:2024-01-29', lead.id, localDate(2024, 1, 26, 9), lead.title, lead.body)],
  })
  assert.equal(fired.some((entry) => entry.key === 'period:2024-01-29'), false)
})

test('preserves stable IDs and suppresses water entries that are past or in history', () => {
  const first = buildNativeReminderPlan({ latest, cycleLength: 28, periodLength: 5, preferences, now: localDate(2024, 1, 3, 8) })
  const firstWater = first.find((entry) => entry.key === 'water:2024-01-03:09:00')
  const second = buildNativeReminderPlan({
    latest,
    cycleLength: 28,
    periodLength: 5,
    preferences,
    now: localDate(2024, 1, 3, 10),
    history: ['water:2024-01-03:09:00'],
    previous: first,
  })
  assert.equal(second.some((entry) => entry.key === firstWater.key), false)
  assert.equal(second.find((entry) => entry.key === 'water:2024-01-03:13:00').id, first.find((entry) => entry.key === 'water:2024-01-03:13:00').id)
})

test('returns empty plan without data or when water and period reminders are disabled', () => {
  assert.deepEqual(buildNativeReminderPlan({ preferences, now: localDate(2024, 1, 3) }), [])
  assert.deepEqual(buildNativeReminderPlan({ latest, cycleLength: 28, periodLength: 5, preferences: { ...preferences, waterEnabled: false, periodEnabled: false }, now: localDate(2024, 1, 3) }), [])
})

test('reconciles owned notifications, leaves reserved IDs untouched, and schedules plugin payloads', async () => {
  const now = localDate(2024, 1, 3, 8)
  const plan = buildNativeReminderPlan({ latest, cycleLength: 28, periodLength: 5, preferences, now })
  const desired = plan.find((entry) => entry.key === 'water:2024-01-03:09:00')
  const stale = candidate('water:2024-01-03:09:00', desired.id, localDate(2024, 1, 3, 10), desired.title, desired.body)
  const calls = []
  const plugin = {
    async getPending() {
      return [
        { id: desired.id, title: desired.title, body: desired.body, extra: { owner: 'day-red', key: desired.key }, schedule: { at: new Date(desired.at) } },
        { id: 2147483640, title: 'other app', extra: { owner: 'other' } },
        { id: 100001, title: stale.title, body: stale.body, extra: { owner: 'day-red', key: stale.key }, schedule: { at: new Date(stale.at) } },
      ]
    },
    async cancel(payload) { calls.push(['cancel', payload]) },
    async schedule(payload) { calls.push(['schedule', payload]) },
  }
  const reconcile = createNativeReminderReconciler(plugin)
  const result = await reconcile(plan, [stale])
  assert.equal(calls[0][0], 'cancel')
  assert.ok(calls[0][1].notifications.some(({ id }) => id === 100001))
  assert.equal(calls[0][1].notifications.some(({ id }) => id === 2147483640), false)
  assert.equal(calls.filter(([kind]) => kind === 'schedule').length, 1)
  const scheduled = calls.find(([kind]) => kind === 'schedule')[1].notifications
  assert.ok(scheduled.every((entry) => entry.sound === 'default' && entry.extra.owner === 'day-red'))
  assert.ok(result.some((entry) => entry.key === desired.key))
})

test('limits pending reminders, deduplicates times and handles colliding persisted IDs', () => {
  const longPeriod = { ...latest, periodLength: 15, endDate: '2024-01-15', cycleLength: 28 }
  const options = { latest: longPeriod, cycleLength: 28, periodLength: 15, preferences, now: localDate(2024, 1, 1, 8) }
  const plan = buildNativeReminderPlan(options)
  assert.equal(plan.length, 63)
  assert.equal(new Set(plan.map(({ id }) => id)).size, plan.length)
  const previous = plan.slice(0, 2).map((entry) => ({ ...entry, id: 100001 }))
  const collision = buildNativeReminderPlan({ ...options, previous })
  assert.equal(new Set(collision.map(({ id }) => id)).size, collision.length)
  const deduped = buildNativeReminderPlan({ ...options, preferences: { ...preferences, waterTimes: ['09:00', '09:00', 'bad', '25:00'] } })
  assert.equal(deduped.filter(({ key }) => key === 'water:2024-01-01:09:00').length, 1)
})

test('future lead is scheduled well before the lead window and changes when leadDays changes', () => {
  const options = { latest, cycleLength: 28, periodLength: 5, preferences, now: localDate(2024, 1, 10) }
  const first = buildNativeReminderPlan(options)
  const second = buildNativeReminderPlan({ ...options, preferences: { ...preferences, leadDays: 7 }, previous: first })
  const a = first.find(({ key }) => key.startsWith('period:'))
  const b = second.find(({ key }) => key.startsWith('period:'))
  assert.equal(a.at, at(localDate(2024, 1, 26, 9)))
  assert.equal(a.body, 'Kỳ kinh tiếp theo có thể bắt đầu sau 3 ngày.')
  assert.equal(b.at, at(localDate(2024, 1, 22, 9)))
  assert.equal(b.id, a.id)
})

test('an empty plan cancels stale reminders but keeps the test notification', async () => {
  const calls = []
  const plugin = {
    async getPending() { return { notifications: [{ id: 100001 }, { id: 2147483640 }] } },
    async cancel(payload) { calls.push(payload) },
    async schedule() { throw new Error('unexpected schedule') },
  }
  await createNativeReminderReconciler(plugin)([], [])
  assert.deepEqual(calls, [{ notifications: [{ id: 100001 }] }])
})

test('serializes reconciliations and rejects plugin failures for retry', async () => {
  const calls = []
  let fail = true
  const plugin = {
    async getPending() { calls.push('get'); if (fail) throw new Error('temporary') ; return [] },
    async cancel() { calls.push('cancel') },
    async schedule() { calls.push('schedule') },
  }
  const reconcile = createNativeReminderReconciler(plugin)
  await assert.rejects(reconcile([], []), /temporary/)
  fail = false
  const first = reconcile([], [])
  const second = reconcile([], [])
  await Promise.all([first, second])
  assert.deepEqual(calls, ['get', 'get', 'get'])
})
