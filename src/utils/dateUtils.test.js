import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, addMonths, dateDifference, getMonthGrid, isBetween, parseDateKey, toDateKey } from './dateUtils.js'

test('date keys are strictly validated', () => {
  assert.equal(parseDateKey('2024-02-29') instanceof Date, true)
  assert.equal(parseDateKey('2023-02-29'), null)
  assert.equal(parseDateKey('2024-2-01'), null)
  assert.equal(parseDateKey('0000-01-01'), null)
})

test('day arithmetic uses calendar days across leap years', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')
  assert.equal(addDays('2024-02-29', 1), '2024-03-01')
  assert.equal(addDays('2024-03-01', -1), '2024-02-29')
  assert.equal(dateDifference('2024-02-28', '2024-03-01'), 2)
  assert.equal(addDays('not-a-date', 1), null)
  assert.equal(addDays('2024-01-01', Number.POSITIVE_INFINITY), null)
})

test('month arithmetic handles year boundaries and invalid months', () => {
  assert.equal(addMonths('2024-01', -1), '2023-12')
  assert.equal(addMonths('2024-12', 1), '2025-01')
  assert.equal(addMonths('2024-13', 1), null)
})

test('calendar helpers reject invalid values', () => {
  assert.equal(toDateKey(new Date('invalid')), null)
  assert.equal(getMonthGrid('2024-02').length, 42)
  assert.equal(getMonthGrid('bad').length, 0)
  assert.equal(isBetween('2024-02-29', '2024-02-01', '2024-03-01'), true)
})
