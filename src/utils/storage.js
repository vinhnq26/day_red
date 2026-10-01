import { addDays, parseDateKey } from './dateUtils.js'

const STORAGE_KEY = 'day-red-state-v1'
const STORAGE_VERSION = 3
const MAX_LOGS = 1000
const MIN_CYCLE_LENGTH = 15
const MAX_CYCLE_LENGTH = 60
const MIN_PERIOD_LENGTH = 1
const MAX_PERIOD_LENGTH = 15

export const defaultState = Object.freeze({
  settings: Object.freeze({ cycleLength: 28, periodLength: 5 }),
  periodLogs: Object.freeze([]),
  dailyLogs: Object.freeze([]),
})

let storageStatus = { available: true, unavailable: false, warning: null, version: STORAGE_VERSION }

function cloneDefaultState() {
  return { settings: { ...defaultState.settings }, periodLogs: [], dailyLogs: [] }
}

function notify(options, warning) {
  const callback = typeof options === 'function' ? options : options?.onWarning
  if (typeof callback === 'function') {
    try { callback(warning) } catch { /* warning callbacks must not break storage */ }
  }
}

function setStatus(available, warning = null, options) {
  storageStatus = { available, unavailable: !available, warning, version: STORAGE_VERSION }
  if (warning) notify(options, warning)
}

function annotateState(state) {
  Object.defineProperties(state, {
    storageUnavailable: { value: storageStatus.unavailable, enumerable: false, configurable: true },
    storageWarning: { value: storageStatus.warning, enumerable: false, configurable: true },
  })
  return state
}

function getStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch { return null }
}

function boundedInteger(value, min, max) {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() ? Number(value) : NaN)
  return Number.isInteger(number) && number >= min && number <= max ? number : null
}

function validDate(value) { return typeof value === 'string' && Boolean(parseDateKey(value)) }

function sanitizePeriodLog(log, fallbackCycleLength, fallbackPeriodLength, index) {
  if (!log || typeof log !== 'object' || !validDate(log.startDate)) return null
  const cycleLength = boundedInteger(log.cycleLength, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH) || fallbackCycleLength
  const periodLength = boundedInteger(log.periodLength, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH) || fallbackPeriodLength
  let endDate = log.endDate
  if (endDate !== undefined && endDate !== null && !validDate(endDate)) endDate = null
  if (endDate && endDate < log.startDate) endDate = null
  if (!periodLength && !endDate) return null
  if (endDate && periodLength && addDays(log.startDate, periodLength - 1) !== endDate) endDate = null
  if (!endDate) endDate = addDays(log.startDate, periodLength - 1)
  const actualLength = endDate ? Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${log.startDate}T00:00:00Z`)) / 86_400_000) + 1 : null
  if (!actualLength || actualLength < MIN_PERIOD_LENGTH || actualLength > MAX_PERIOD_LENGTH) return null
  return {
    ...log,
    id: typeof log.id === 'string' && log.id ? log.id : `${log.startDate}-${index}`,
    startDate: log.startDate,
    endDate,
    periodLength: periodLength || actualLength,
    cycleLength,
    symptoms: Array.isArray(log.symptoms) ? log.symptoms.filter((item) => typeof item === 'string').slice(0, 50) : [],
    note: typeof log.note === 'string' ? log.note.slice(0, 2000) : '',
  }
}

function sanitizeDailyLog(log) {
  if (!log || typeof log !== 'object' || !validDate(log.date)) return null
  return {
    ...log,
    date: log.date,
    flow: typeof log.flow === 'string' ? log.flow.slice(0, 30) : '',
    symptoms: Array.isArray(log.symptoms) ? log.symptoms.filter((item) => typeof item === 'string').slice(0, 50) : [],
    note: typeof log.note === 'string' ? log.note.slice(0, 2000) : '',
  }
}

function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {}
  const cycleLength = boundedInteger(source.settings?.cycleLength, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH) || defaultState.settings.cycleLength
  const periodLength = boundedInteger(source.settings?.periodLength, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH) || defaultState.settings.periodLength
  const periodLogs = Array.isArray(source.periodLogs)
    ? source.periodLogs.map((log, index) => sanitizePeriodLog(log, cycleLength, periodLength, index)).filter(Boolean).slice(0, MAX_LOGS)
    : []
  const dailyLogs = Array.isArray(source.dailyLogs) ? source.dailyLogs.map(sanitizeDailyLog).filter(Boolean).slice(0, MAX_LOGS) : []
  return { settings: { cycleLength, periodLength }, periodLogs, dailyLogs }
}

export function getStorageStatus() { return { ...storageStatus } }

export function loadState(options = {}) {
  const storage = getStorage()
  if (!storage) return annotateState(cloneDefaultStateWithWarning(options, 'Bộ nhớ trên thiết bị hiện không khả dụng.'))
  let raw
  try { raw = storage.getItem(STORAGE_KEY) } catch {
    return annotateState(cloneDefaultStateWithWarning(options, 'Không thể đọc dữ liệu đã lưu trên thiết bị.'))
  }
  if (!raw) {
    setStatus(true, null, options)
    return annotateState(cloneDefaultState())
  }
  try {
    const parsed = JSON.parse(raw)
    const payload = parsed && parsed.version !== undefined && parsed.state && typeof parsed.state === 'object' ? parsed.state : parsed
    const state = sanitizeState(payload)
    const hadInvalidEntries = JSON.stringify(payload) !== JSON.stringify(state)
    setStatus(true, hadInvalidEntries ? 'Một số dữ liệu không hợp lệ đã bị bỏ qua.' : null, options)
    return annotateState(state)
  } catch {
    return annotateState(cloneDefaultStateWithWarning(options, 'Dữ liệu lưu trữ bị hỏng và đã được bỏ qua.'))
  }
}

function cloneDefaultStateWithWarning(options, warning) {
  setStatus(false, warning, options)
  return cloneDefaultState()
}

export function saveState(state, options = {}) {
  const storage = getStorage()
  if (!storage) { setStatus(false, 'Bộ nhớ trên thiết bị hiện không khả dụng.', options); return false }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state: sanitizeState(state) }))
    setStatus(true, null, options)
    return true
  } catch {
    setStatus(false, 'Không thể lưu dữ liệu trên thiết bị.', options)
    return false
  }
}

export function clearState(options = {}) {
  const storage = getStorage()
  if (!storage) { setStatus(false, 'Bộ nhớ trên thiết bị hiện không khả dụng.', options); return false }
  try {
    storage.removeItem(STORAGE_KEY)
    setStatus(true, null, options)
    return true
  } catch {
    setStatus(false, 'Không thể xóa dữ liệu trên thiết bị.', options)
    return false
  }
}

export { STORAGE_KEY, STORAGE_VERSION }
