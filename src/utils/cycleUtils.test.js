import test from 'node:test'
import assert from 'node:assert/strict'
import { getAllPeriodDates, getCurrentPrediction, getLatestLog, getPredictions, getStatus, sortLogs } from './cycleUtils.js'

const latest = { startDate: '2024-01-01', endDate: '2024-01-05', periodLength: 5 }

test('predictions are anchored to the latest recorded start', () => {
  assert.deepEqual(getCurrentPrediction(latest, 28, 5), { startDate: '2024-01-29', endDate: '2024-02-02', cycleOffset: 1, index: 1 })
  assert.equal(getCurrentPrediction(latest, 28, 5).startDate, '2024-01-29')
  assert.equal(getPredictions(latest, 28, 5, 8).length, 8)
  assert.equal(getPredictions(latest, 28, 5, 1000).length, 120)
  assert.equal(getPredictions(latest, 28, 5, { count: 2, from: '2024-02-01' }).length, 2)
})

test('status distinguishes current actual period, due today, and overdue', () => {
  assert.equal(getStatus(latest, 28, 5, '2024-01-03').type, 'period')
  assert.equal(getStatus(latest, 28, 5, '2024-01-29').type, 'today')
  assert.equal(getStatus(latest, 28, 5, '2024-02-01').type, 'overdue')
  assert.equal(getStatus({ ...latest, endDate: '2024-01-08', periodLength: 8 }, 28, 5, '2024-01-06').type, 'period')
})

test('corrupt logs are ignored and period sets are bounded', () => {
  assert.equal(sortLogs([null, {}, { startDate: 'bad' }, latest]).length, 1)
  const dates = getAllPeriodDates([{ startDate: '2024-01-01', endDate: '9999-12-31' }, latest], [{ startDate: '2024-01-10', endDate: '2024-01-12' }])
  assert.equal(dates.confirmed.size, 5)
  assert.equal(dates.predicted.size, 3)
})

test('each actual period keeps its own cycle settings', () => {
  const previous = { startDate: '2024-01-01', endDate: '2024-01-05', periodLength: 5, cycleLength: 28 }
  const current = { startDate: '2024-01-29', endDate: '2024-02-02', periodLength: 5, cycleLength: 31 }
  assert.equal(getCurrentPrediction(current, 20, 3).startDate, '2024-02-29')
  assert.equal(getCurrentPrediction(previous, 20, 3).startDate, '2024-01-29')
  assert.equal(getAllPeriodDates([previous, current], []).confirmed.size, 10)
})

test('editing an older period does not change a newer prediction anchor', () => {
  const previous = { startDate: '2024-01-01', endDate: '2024-01-05', periodLength: 5, cycleLength: 28 }
  const current = { startDate: '2024-01-29', endDate: '2024-02-02', periodLength: 5, cycleLength: 28 }
  const editedPrevious = { ...previous, startDate: '2024-01-03', endDate: '2024-01-07' }
  assert.equal(getCurrentPrediction(current, 20, 3).startDate, '2024-02-26')
  assert.equal(getCurrentPrediction(editedPrevious, 20, 3).startDate, '2024-01-31')
  assert.equal(getLatestLog([editedPrevious, current]).startDate, current.startDate)
})
