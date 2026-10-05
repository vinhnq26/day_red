import test from 'node:test'
import assert from 'node:assert/strict'
import { getReminderCandidates } from './reminders.js'

const latest = { startDate: '2024-01-01', endDate: '2024-01-05', periodLength: 5, cycleLength: 28 }
const prefs = { periodEnabled: true, waterEnabled: true, leadDays: 3, waterTimes: ['09:00', '13:00', '17:00'] }

test('creates a cycle reminder inside the configured lead window', () => {
  const candidates = getReminderCandidates({ latest, cycleLength: 28, periodLength: 5, today: '2024-01-26', preferences: prefs })
  assert.deepEqual(candidates.map(({ type, key }) => ({ type, key })), [{ type: 'period', key: 'period:2024-01-29' }])
})

test('creates a due reminder today and suppresses overdue reminders', () => {
  const due = getReminderCandidates({ latest, cycleLength: 28, periodLength: 5, today: '2024-01-29', preferences: prefs })
  assert.equal(due[0].type, 'period')
  const overdue = getReminderCandidates({ latest, cycleLength: 28, periodLength: 5, today: '2024-01-30', preferences: prefs })
  assert.equal(overdue.length, 0)
})

test('does not remind for a new period while an actual period is active', () => {
  const candidates = getReminderCandidates({ latest, cycleLength: 28, periodLength: 5, today: '2024-01-03', preferences: prefs })
  assert.equal(candidates.length, 0)
})

test('creates one water reminder at each configured time while in period', () => {
  const candidates = getReminderCandidates({ latest, cycleLength: 28, periodLength: 5, today: '2024-01-03', now: new Date(2024, 0, 3, 13, 0), preferences: prefs })
  assert.deepEqual(candidates.map(({ type, key }) => ({ type, key })), [{ type: 'water', key: 'water:2024-01-03:13:00' }])
})

test('allows a short timer delay after a configured water time', () => {
  const candidates = getReminderCandidates({ latest, cycleLength: 28, periodLength: 5, today: '2024-01-03', now: new Date(2024, 0, 3, 13, 1), preferences: prefs })
  assert.deepEqual(candidates.map(({ type, key }) => ({ type, key })), [{ type: 'water', key: 'water:2024-01-03:13:00' }])
})

test('history prevents duplicate notifications', () => {
  const candidates = getReminderCandidates({ latest, cycleLength: 28, periodLength: 5, today: '2024-01-26', preferences: prefs, history: ['period:2024-01-29'] })
  assert.equal(candidates.length, 0)
})
