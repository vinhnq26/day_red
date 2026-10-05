import { addDays, dateDifference, isBetween, parseDateKey, todayKey } from './dateUtils.js'

const MIN_CYCLE_LENGTH = 15
const MAX_CYCLE_LENGTH = 60
const MIN_PERIOD_LENGTH = 1
const MAX_PERIOD_LENGTH = 31
const MAX_PREDICTIONS = 120
const MAX_PERIOD_DAYS = 366

function integerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
}

function validDate(value) { return typeof value === 'string' && Boolean(parseDateKey(value)) }

function validLog(log) {
  if (!log || typeof log !== 'object' || !validDate(log.startDate)) return false
  if (log.endDate !== undefined && log.endDate !== null) {
    if (!validDate(log.endDate) || dateDifference(log.startDate, log.endDate) < 0) return false
  }
  if (log.periodLength !== undefined && log.periodLength !== null && !integerInRange(log.periodLength, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH)) return false
  return true
}

function validPeriod(period) {
  return period && validDate(period.startDate) && validDate(period.endDate) && dateDifference(period.startDate, period.endDate) >= 0
}

function periodEnd(log, fallbackLength = 5) {
  if (!validLog(log)) return null
  if (validDate(log.endDate) && dateDifference(log.startDate, log.endDate) <= MAX_PERIOD_DAYS) return log.endDate
  const length = integerInRange(log.periodLength, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH) ? log.periodLength : fallbackLength
  return integerInRange(length, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH) ? addDays(log.startDate, length - 1) : null
}

function predictionConfig(latest, cycleLength, periodLength) {
  if (!validLog(latest)) return null
  const resolvedCycleLength = integerInRange(latest.cycleLength, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH)
    ? latest.cycleLength
    : cycleLength
  const resolvedPeriodLength = integerInRange(latest.periodLength, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH)
    ? latest.periodLength
    : periodLength
  return integerInRange(resolvedCycleLength, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH)
    && integerInRange(resolvedPeriodLength, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH)
    ? { cycleLength: resolvedCycleLength, periodLength: resolvedPeriodLength }
    : null
}

export function sortLogs(logs) {
  if (!Array.isArray(logs)) return []
  return logs.filter(validLog).slice().sort((a, b) => b.startDate.localeCompare(a.startDate))
}

export function getLatestLog(logs) { return sortLogs(logs)[0] || null }

export function getPredictions(latest, cycleLength, periodLength, count = 6, range) {
  const config = predictionConfig(latest, cycleLength, periodLength)
  if (!config) return []
  let options = {}
  if (count && typeof count === 'object') options = count
  else options = { ...(range && typeof range === 'object' ? range : {}), count }
  const requestedCount = options.count === undefined ? 6 : options.count
  if (!Number.isInteger(requestedCount) || requestedCount < 0) return []
  const boundedCount = Math.min(requestedCount, MAX_PREDICTIONS)
  const from = options.from || options.startDate
  const to = options.to || options.endDate
  if ((from !== undefined && !validDate(from)) || (to !== undefined && !validDate(to))) return []
  if (from && to && dateDifference(from, to) < 0) return []

  const predictions = []
  for (let index = 1; index <= boundedCount; index += 1) {
    const startDate = addDays(latest.startDate, config.cycleLength * index)
    const endDate = startDate ? addDays(startDate, config.periodLength - 1) : null
    if (!startDate || !endDate) break
    if ((!from || dateDifference(from, endDate) >= 0) && (!to || dateDifference(startDate, to) >= 0)) {
      predictions.push({ startDate, endDate, index, cycleOffset: index })
    }
  }
  return predictions
}

export function getCurrentPrediction(latest, cycleLength, periodLength) {
  const config = predictionConfig(latest, cycleLength, periodLength)
  if (!config) return null
  const startDate = addDays(latest.startDate, config.cycleLength)
  return startDate ? { startDate, endDate: addDays(startDate, config.periodLength - 1), cycleOffset: 1, index: 1 } : null
}

export function getAutoConfirmedPeriod(latest, cycleLength, periodLength, today = todayKey()) {
  if (!validDate(today)) return null
  const prediction = getCurrentPrediction(latest, cycleLength, periodLength)
  if (!prediction || prediction.startDate !== today) return null
  if (getStatus(latest, cycleLength, periodLength, today).type !== 'today') return null
  const resolvedCycleLength = integerInRange(latest?.cycleLength, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH)
    ? latest.cycleLength
    : cycleLength
  const resolvedPeriodLength = integerInRange(latest?.periodLength, MIN_PERIOD_LENGTH, 15)
    ? latest.periodLength
    : periodLength
  if (!integerInRange(resolvedCycleLength, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH)
    || !integerInRange(resolvedPeriodLength, MIN_PERIOD_LENGTH, 15)) return null
  return { ...prediction, cycleLength: resolvedCycleLength, periodLength: resolvedPeriodLength }
}

export function getStatus(latest, cycleLength, periodLength, today = todayKey()) {
  if (!validLog(latest)) return { type: 'empty', label: 'Chưa thiết lập' }
  if (!validDate(today)) return { type: 'empty', label: 'Chưa thiết lập' }
  const actualEndDate = periodEnd(latest, periodLength)
  if (actualEndDate && isBetween(today, latest.startDate, actualEndDate)) return { type: 'period', label: 'Đang trong kỳ' }
  const next = getCurrentPrediction(latest, cycleLength, periodLength)
  if (!next) return { type: 'empty', label: 'Chưa thiết lập' }
  const days = dateDifference(today, next.startDate)
  if (days === null) return { type: 'empty', label: 'Chưa thiết lập' }
  if (days === 0) return { type: 'today', label: 'Hôm nay' }
  if (days < 0) return { type: 'overdue', label: `Đã trễ ${Math.abs(days)} ngày` }
  return { type: days <= 7 ? 'soon' : 'normal', label: `Còn ${days} ngày` }
}

export function getCycleDay(latest, today = todayKey()) {
  if (!validLog(latest) || !validDate(today)) return null
  const difference = dateDifference(latest.startDate, today)
  return difference === null ? null : difference + 1
}

function addPeriodDays(target, startDate, endDate) {
  if (!validDate(startDate) || !validDate(endDate)) return
  const duration = dateDifference(startDate, endDate)
  if (duration === null || duration < 0 || duration > MAX_PERIOD_DAYS) return
  for (let offset = 0; offset <= duration; offset += 1) {
    const date = addDays(startDate, offset)
    if (date) target.add(date)
  }
}

export function getAllPeriodDates(logs, predictions) {
  const confirmed = new Set()
  if (Array.isArray(logs)) logs.forEach((log) => {
    const end = periodEnd(log)
    if (end) addPeriodDays(confirmed, log.startDate, end)
  })
  const predicted = new Set()
  if (Array.isArray(predictions)) predictions.forEach((period) => {
    if (validPeriod(period)) addPeriodDays(predicted, period.startDate, period.endDate)
  })
  return { confirmed, predicted }
}

export const cycleLimits = Object.freeze({ MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH, MAX_PREDICTIONS, MAX_PERIOD_DAYS })
