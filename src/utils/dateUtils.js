const DAY_MS = 86_400_000
const MIN_YEAR = 1
const MAX_YEAR = 9_999
const MAX_DAY_OFFSET = 3_650_000

const pad = (value) => String(value).padStart(2, '0')

function isValidYear(year) { return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR }

function makeLocalDate(year, month, day) {
  const date = new Date(0)
  date.setHours(12, 0, 0, 0)
  date.setFullYear(year, month - 1, day)
  return date
}

function makeUtcDate(year, month, day) {
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date
}

function dateParts(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return isValidYear(year) ? { year, month, day } : null
}

function keyFromOrdinal(ordinal) {
  if (!Number.isSafeInteger(ordinal)) return null
  const date = new Date(ordinal * DAY_MS)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getUTCFullYear()
  if (!isValidYear(year)) return null
  return `${String(year).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function ordinalFromKey(value) {
  const date = parseDateKey(value)
  return date ? Math.floor(makeUtcDate(date.getFullYear(), date.getMonth() + 1, date.getDate()).getTime() / DAY_MS) : null
}

export function toDateKey(date) {
  const parts = dateParts(date)
  return parts ? `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}` : null
}

export function parseDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!isValidYear(year) || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = makeLocalDate(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

export function todayKey() { return toDateKey(new Date()) }

export function addDays(value, amount) {
  const key = typeof value === 'string' ? value : toDateKey(value)
  const ordinal = ordinalFromKey(key)
  if (ordinal === null || !Number.isInteger(amount) || !Number.isSafeInteger(amount) || Math.abs(amount) > MAX_DAY_OFFSET) return null
  return keyFromOrdinal(ordinal + amount)
}

export function addMonths(value, amount) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value) || !Number.isInteger(amount) || Math.abs(amount) > 120_000) return null
  const [year, month] = value.split('-').map(Number)
  if (!isValidYear(year) || month < 1 || month > 12) return null
  const monthOrdinal = year * 12 + month - 1 + amount
  const resultYear = Math.floor(monthOrdinal / 12)
  const resultMonth = ((monthOrdinal % 12) + 12) % 12 + 1
  return isValidYear(resultYear) ? `${String(resultYear).padStart(4, '0')}-${pad(resultMonth)}` : null
}

export function dateDifference(from, to) {
  const a = ordinalFromKey(from)
  const b = ordinalFromKey(to)
  return a === null || b === null ? null : b - a
}

export function formatDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const date = parseDateKey(value)
  return date ? new Intl.DateTimeFormat('vi-VN', options).format(date) : '—'
}

export function monthLabel(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return '—'
  const date = parseDateKey(`${monthKey}-01`)
  return date ? new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(date) : '—'
}

export function getMonthGrid(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return []
  const first = parseDateKey(`${monthKey}-01`)
  if (!first) return []
  const firstKey = toDateKey(first)
  const mondayIndex = (first.getDay() + 6) % 7
  const start = addDays(firstKey, -mondayIndex)
  return start ? Array.from({ length: 42 }, (_, index) => addDays(start, index)).filter(Boolean) : []
}

export function isSameOrBefore(a, b) {
  const difference = dateDifference(a, b)
  return difference !== null && difference >= 0
}

export function isBetween(value, start, end) {
  const fromValue = dateDifference(start, value)
  const toValue = dateDifference(value, end)
  return fromValue !== null && toValue !== null && fromValue >= 0 && toValue >= 0
}

export const dateLimits = Object.freeze({ MIN_YEAR, MAX_YEAR, MAX_DAY_OFFSET })
