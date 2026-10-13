import { addDays, parseDateKey } from './dateUtils.js'
import { appConfig } from '../config/appConfig.js'

const LEGACY_STORAGE_KEY = 'day-red-state-v1'
const STORAGE_KEY = appConfig.isCommercial ? 'day-red-state-commercial-v1' : LEGACY_STORAGE_KEY
const STORAGE_VERSION = 6
const MAX_LOGS = 1000
const MAX_REMINDER_HISTORY = 500
const MAX_NATIVE_SCHEDULE = 126
const NATIVE_NOTIFICATION_MIN_ID = 100000
const NATIVE_NOTIFICATION_MAX_ID = 2147483000
const MIN_CYCLE_LENGTH = 15
const MAX_CYCLE_LENGTH = 60
const MIN_PERIOD_LENGTH = 1
const MAX_PERIOD_LENGTH = 15
const DEFAULT_WATER_TIMES = Object.freeze(['09:00', '13:00', '17:00'])
const DEFAULT_PROFILE = Object.freeze({
  name: appConfig.greetingName,
  email: appConfig.defaultProfileEmail,
})

export const defaultState = Object.freeze({
  profile: DEFAULT_PROFILE,
  settings: Object.freeze({
    cycleLength: 28,
    periodLength: 5,
    reminders: Object.freeze({
      periodEnabled: true,
      waterEnabled: true,
      leadDays: 3,
      waterTimes: DEFAULT_WATER_TIMES,
      emailEnabled: false,
      emailAddress: DEFAULT_PROFILE.email,
    }),
  }),
  periodLogs: Object.freeze([]),
  dailyLogs: Object.freeze([]),
  reminderHistory: Object.freeze([]),
  nativeNotificationSchedule: Object.freeze([]),
})

let storageStatus = { available: true, unavailable: false, warning: null, version: STORAGE_VERSION }

function cloneDefaultState() {
  return {
    profile: { ...defaultState.profile },
    settings: {
      ...defaultState.settings,
      reminders: { ...defaultState.settings.reminders, waterTimes: [...DEFAULT_WATER_TIMES] },
    },
    periodLogs: [],
    dailyLogs: [],
    reminderHistory: [],
    nativeNotificationSchedule: [],
  }
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

function sanitizeProfile(value, legacyEmail = '') {
  const source = value && typeof value === 'object' ? value : {}
  const name = typeof source.name === 'string' ? source.name.trim().slice(0, 80) : ''
  const rawEmail = typeof source.email === 'string' ? source.email.trim() : ''
  const fallback = typeof legacyEmail === 'string' ? legacyEmail.trim() : ''
  const email = rawEmail || (fallback && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fallback) ? fallback.slice(0, 254) : '')
  return {
    name,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 254) : '',
  }
}

export function sanitizeReminders(value) {
  const source = value && typeof value === 'object' ? value : {}
  const validTimes = Array.isArray(source.waterTimes)
    && source.waterTimes.length === 3
    && source.waterTimes.every((time) => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    && new Set(source.waterTimes).size === 3
  return {
    periodEnabled: typeof source.periodEnabled === 'boolean' ? source.periodEnabled : true,
    waterEnabled: typeof source.waterEnabled === 'boolean' ? source.waterEnabled : true,
    leadDays: boundedInteger(source.leadDays, 1, 7) || 3,
    waterTimes: validTimes ? [...source.waterTimes].sort() : [...DEFAULT_WATER_TIMES],
    emailEnabled: typeof source.emailEnabled === 'boolean' ? source.emailEnabled : false,
    emailAddress: typeof source.emailAddress === 'string' && source.emailAddress.trim() === ''
      ? ''
      : typeof source.emailAddress === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source.emailAddress.trim())
        ? source.emailAddress.trim().slice(0, 254)
        : appConfig.defaultProfileEmail,
  }
}

function sanitizeReminderHistory(value) {
  if (!Array.isArray(value)) return []
  const valid = value.filter((key) => {
    if (typeof key !== 'string') return false
    const match = key.match(/^(?:period|water|email:period):(\d{4}-\d{2}-\d{2})(?::([01]\d|2[0-3]):[0-5]\d)?$/)
    return Boolean(match && validDate(match[1]))
  })
  return [...new Set(valid)].slice(-MAX_REMINDER_HISTORY)
}

function sanitizeNativeNotificationSchedule(value) {
  if (!Array.isArray(value)) return []
  const usedKeys = new Set()
  const usedIds = new Set()
  return value.filter((entry) => {
    if (!entry || typeof entry !== 'object' || typeof entry.key !== 'string') return false
    const match = entry.key.match(/^(?:period|water):(\d{4}-\d{2}-\d{2})/)
    const keyValid = /^(?:period:\d{4}-\d{2}-\d{2}|water:\d{4}-\d{2}-\d{2}:(?:[01]\d|2[0-3]):[0-5]\d)$/.test(entry.key)
    const id = boundedInteger(entry.id, NATIVE_NOTIFICATION_MIN_ID, NATIVE_NOTIFICATION_MAX_ID)
    const at = typeof entry.at === 'string' && !Number.isNaN(new Date(entry.at).getTime())
    if (!keyValid || !match || !validDate(match[1]) || id === null || !at || usedKeys.has(entry.key) || usedIds.has(id)) return false
    usedKeys.add(entry.key)
    usedIds.add(id)
    return true
  }).slice(0, MAX_NATIVE_SCHEDULE)
}

function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {}
  const cycleLength = boundedInteger(source.settings?.cycleLength, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH) || defaultState.settings.cycleLength
  const periodLength = boundedInteger(source.settings?.periodLength, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH) || defaultState.settings.periodLength
  const legacyEmail = source.settings?.reminders?.emailAddress
  const profileFallback = typeof legacyEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legacyEmail.trim())
    ? legacyEmail
    : appConfig.defaultProfileEmail
  const hasProfile = source.profile && typeof source.profile === 'object'
  const profileFallbackForMissingField = hasProfile && !Object.prototype.hasOwnProperty.call(source.profile, 'email') ? profileFallback : ''
  const profile = sanitizeProfile(hasProfile ? source.profile : undefined, hasProfile ? profileFallbackForMissingField : profileFallback)
  const reminders = sanitizeReminders({
    ...source.settings?.reminders,
    emailAddress: profile.email,
  })
  const periodLogs = Array.isArray(source.periodLogs)
    ? source.periodLogs.map((log, index) => sanitizePeriodLog(log, cycleLength, periodLength, index)).filter(Boolean).slice(0, MAX_LOGS)
    : []
  const dailyLogs = Array.isArray(source.dailyLogs) ? source.dailyLogs.map(sanitizeDailyLog).filter(Boolean).slice(0, MAX_LOGS) : []
  return {
    profile,
    settings: {
      cycleLength,
      periodLength,
      reminders,
    },
    periodLogs,
    dailyLogs,
    reminderHistory: sanitizeReminderHistory(source.reminderHistory),
    nativeNotificationSchedule: sanitizeNativeNotificationSchedule(source.nativeNotificationSchedule),
  }
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
