import test from 'node:test'
import assert from 'node:assert/strict'
import { clearState, getStorageStatus, loadState, saveState, STORAGE_KEY, STORAGE_VERSION } from './storage.js'

function installStorage(initial = null, throwing = false) {
  const data = new Map(initial === null ? [] : [[STORAGE_KEY, initial]])
  globalThis.window = { localStorage: {
    getItem: () => { if (throwing) throw new Error('unavailable'); return data.get(STORAGE_KEY) ?? null },
    setItem: (key, value) => { if (throwing) throw new Error('unavailable'); data.set(key, value) },
    removeItem: (key) => { if (throwing) throw new Error('unavailable'); data.delete(key) },
  } }
  return data
}

test('storage sanitizes malformed logs and writes a versioned envelope', () => {
  installStorage(JSON.stringify({ settings: { cycleLength: 'bad', periodLength: 999 }, periodLogs: [{ startDate: 'bad' }, { startDate: '2024-01-01', endDate: '2024-01-05', periodLength: 5 }], dailyLogs: [{ date: 'nope' }] }))
  const state = loadState()
  assert.deepEqual(state.settings, {
    cycleLength: 28,
    periodLength: 5,
    reminders: {
      periodEnabled: true,
      waterEnabled: true,
      leadDays: 3,
      waterTimes: ['09:00', '13:00', '17:00'],
      emailEnabled: false,
      emailAddress: 'yennhivo03022000@gmail.com',
    },
  })
  assert.equal(state.periodLogs.length, 1)
  assert.equal(state.periodLogs[0].cycleLength, 28)
  assert.equal(state.periodLogs[0].id, '2024-01-01-1')
  assert.equal(state.dailyLogs.length, 0)
  assert.equal(saveState(state), true)
  const saved = JSON.parse(globalThis.window.localStorage.getItem(STORAGE_KEY))
  assert.equal(saved.version, STORAGE_VERSION)
  assert.deepEqual(saved.state.settings, state.settings)
  assert.equal(saved.state.periodLogs[0].cycleLength, 28)
})

test('per-log cycle length survives settings changes', () => {
  installStorage()
  const state = loadState()
  const savedState = { ...state, settings: { cycleLength: 40, periodLength: 7 }, periodLogs: [{ id: 'a', startDate: '2024-01-01', endDate: '2024-01-05', periodLength: 5, cycleLength: 28 }] }
  assert.equal(saveState(savedState), true)
  const loaded = loadState()
  assert.equal(loaded.settings.cycleLength, 40)
  assert.equal(loaded.periodLogs[0].cycleLength, 28)
})

test('email reminder settings survive a storage round trip', () => {
  installStorage()
  const state = loadState()
  state.settings.reminders.emailEnabled = true
  state.settings.reminders.emailAddress = 'person@example.com'
  assert.equal(saveState(state), true)
  const loaded = loadState()
  assert.equal(loaded.settings.reminders.emailEnabled, true)
  assert.equal(loaded.settings.reminders.emailAddress, 'person@example.com')
})

test('invalid email settings fall back to the configured recipient', () => {
  installStorage(JSON.stringify({
    version: 3,
    state: {
      settings: {
        cycleLength: 28,
        periodLength: 5,
        reminders: { emailEnabled: true, emailAddress: 'invalid' },
      },
    },
  }))
  const state = loadState()
  assert.equal(state.settings.reminders.emailEnabled, true)
  assert.equal(state.settings.reminders.emailAddress, 'yennhivo03022000@gmail.com')
})

test('storage failures do not crash and expose unavailable warning', () => {
  installStorage(null, true)
  const warnings = []
  const state = loadState({ onWarning: (warning) => warnings.push(warning) })
  assert.deepEqual(state.periodLogs, [])
  assert.equal(state.storageUnavailable, true)
  assert.equal(getStorageStatus().unavailable, true)
  assert.equal(warnings.length, 1)
  assert.equal(saveState(state), false)
  assert.equal(clearState(), false)
})
