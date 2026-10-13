import { addDays, dateDifference, parseDateKey, toDateKey } from './dateUtils.js'
import { getCurrentPrediction, getStatus, getAllPeriodDates } from './cycleUtils.js'
import { reminderKey } from './reminders.js'

const OWNER = 'day-red'
const MIN_NATIVE_ID = 100_000
const MAX_NATIVE_ID = 2_147_483_000
const MAX_PLAN_ENTRIES = 63
const MAX_PREVIOUS_ENTRIES = 126
const CATCH_UP_DELAY_MS = 5_000
const DEFAULT_LEAD_DAYS = 3
const WATER_TITLE = 'Đã đến lúc uống nước'
const WATER_BODY = 'Uống một ly nước và chăm sóc cơ thể trong những ngày này nhé.'
const PREDICTED_WATER_TITLE = 'Đã đến lúc uống nước (dự đoán)'
const PREDICTED_WATER_BODY = 'Uống một ly nước và chăm sóc cơ thể trong những ngày dự đoán này nhé.'

function validDate(value) {
  return typeof value === 'string' && Boolean(parseDateKey(value))
}

function validTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function validDateObject(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function localDateAt(dateKey, time) {
  const date = parseDateKey(dateKey)
  if (!date || !validTime(time)) return null
  const [hours, minutes] = time.split(':').map(Number)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function isoAt(date) {
  return validDateObject(date) ? date.toISOString() : null
}

function normalizeAt(value) {
  if (validDateObject(value)) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return validDateObject(date) ? date.toISOString() : null
  }
  return null
}

function normalizeId(value) {
  const id = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function ownId(id) {
  return Number.isSafeInteger(id) && id >= MIN_NATIVE_ID && id <= MAX_NATIVE_ID
}

function previousEntries(previous) {
  return Array.isArray(previous) ? previous.filter((entry) => entry && typeof entry === 'object') : []
}

function historyKeys(history) {
  const keys = new Set()
  if (!Array.isArray(history)) return keys
  history.forEach((entry) => {
    if (typeof entry === 'string') keys.add(entry)
    else if (entry && typeof entry.key === 'string') keys.add(entry.key)
  })
  return keys
}

function previousByKey(previous) {
  const result = new Map()
  previousEntries(previous).forEach((entry) => {
    if (typeof entry.key === 'string' && !result.has(entry.key)) result.set(entry.key, entry)
  })
  return result
}

function fnv1a(value) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function stableIds(candidates, previous) {
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
  const assigned = new Map()
  const used = new Set()

  previousEntries(previous).forEach((entry) => {
    const candidate = byKey.get(entry.key)
    const id = normalizeId(entry.id)
    if (candidate && id !== null && ownId(id) && !used.has(id) && !assigned.has(candidate.key)) {
      assigned.set(candidate.key, id)
      used.add(id)
    }
  })

  const span = MAX_NATIVE_ID - MIN_NATIVE_ID + 1
  const remaining = candidates
    .filter((candidate) => !assigned.has(candidate.key))
    .sort((a, b) => a.key.localeCompare(b.key))
  remaining.forEach((candidate) => {
    let id = MIN_NATIVE_ID + (fnv1a(candidate.key) % span)
    while (used.has(id)) id = id >= MAX_NATIVE_ID ? MIN_NATIVE_ID : id + 1
    assigned.set(candidate.key, id)
    used.add(id)
  })

  return candidates.map((candidate) => ({
    ...candidate,
    id: assigned.get(candidate.key),
    extra: { owner: OWNER, key: candidate.key },
    schedule: { at: new Date(candidate.at) },
  }))
}

function addCandidate(target, candidate) {
  if (!candidate || !candidate.key || target.has(candidate.key)) return
  target.set(candidate.key, candidate)
}

function currentPeriodDates(latest, history, prediction) {
  const logs = [...(Array.isArray(history) ? history : []), latest]
    .filter((log) => log && typeof log === 'object')
  const uniqueLogs = [...new Map(logs
    .filter((log) => typeof log.startDate === 'string')
    .map((log) => [log.startDate, log])).values()]
  const dates = getAllPeriodDates(uniqueLogs, prediction ? [prediction] : [])
  return { confirmed: dates.confirmed, predicted: dates.predicted }
}

function makeWaterCandidate(dateKey, time, predicted, at) {
  const key = reminderKey('water', dateKey, time)
  return {
    key,
    title: predicted ? PREDICTED_WATER_TITLE : WATER_TITLE,
    body: predicted ? PREDICTED_WATER_BODY : WATER_BODY,
    at: isoAt(at),
  }
}

function makePeriodCandidate(prediction, daysUntil, at) {
  const key = reminderKey('period', prediction.startDate)
  return {
    key,
    title: daysUntil === 0 ? 'Có thể tới kỳ hôm nay' : 'Kỳ kinh sắp tới',
    body: daysUntil === 0
      ? 'Hãy chuẩn bị nhẹ nhàng và lắng nghe cơ thể của bạn.'
      : `Kỳ kinh tiếp theo có thể bắt đầu sau ${daysUntil} ngày.`,
    at: isoAt(at),
  }
}

function periodLeadCandidate({ prediction, leadDays, today, now, history, previous }) {
  if (!prediction || !validDate(today)) return null
  const daysUntil = dateDifference(today, prediction.startDate)
  if (daysUntil === null || daysUntil < 0) return null

  const key = reminderKey('period', prediction.startDate)
  const prior = previousByKey(previous).get(key)
  if (history.has(key)) return null

  const nominal = localDateAt(addDays(prediction.startDate, -leadDays), '09:00')
  if (!nominal) return null
  const priorAt = normalizeAt(prior?.at)
  if (priorAt && new Date(priorAt).getTime() <= now.getTime()) return null

  let at = nominal
  if (nominal.getTime() <= now.getTime()) {
    at = priorAt ? new Date(priorAt) : new Date(now.getTime() + CATCH_UP_DELAY_MS)
  }
  const daysAtDelivery = dateDifference(toDateKey(at), prediction.startDate)
  return makePeriodCandidate(prediction, daysAtDelivery, at)
}

export function buildNativeReminderPlan({
  latest,
  cycleLength,
  periodLength,
  preferences = {},
  history = [],
  now = new Date(),
  previous = [],
} = {}) {
  if (!validDateObject(now)) return []
  const today = toDateKey(now)
  const status = getStatus(latest, cycleLength, periodLength, today)
  if (!today || status.type === 'empty') return []

  const prediction = getCurrentPrediction(latest, cycleLength, periodLength)
  const { confirmed, predicted } = currentPeriodDates(latest, history, prediction)
  // String/key entries are accepted for compatibility with reminder history, but
  // period-log objects remain cycle history and are never treated as deliveries.
  const recorded = historyKeys(history)
  const prior = previousByKey(previous)
  const candidates = new Map()

  if (preferences.waterEnabled !== false) {
    const times = [...new Set(Array.isArray(preferences.waterTimes) ? preferences.waterTimes.filter(validTime) : [])].sort()
    const dates = new Set([...confirmed, ...predicted])
    Array.from(dates).sort().forEach((dateKey) => {
      const isPredicted = predicted.has(dateKey) && !confirmed.has(dateKey)
      times.forEach((time) => {
        const at = localDateAt(dateKey, time)
        if (!at || at.getTime() <= now.getTime()) return
        const candidate = makeWaterCandidate(dateKey, time, isPredicted, at)
        if (recorded.has(candidate.key)) return
        addCandidate(candidates, candidate)
      })
    })
  }

  if (preferences.periodEnabled !== false && prediction) {
    const leadDays = Number.isInteger(preferences.leadDays)
      ? Math.max(1, Math.min(7, preferences.leadDays))
      : DEFAULT_LEAD_DAYS
    const candidate = periodLeadCandidate({ prediction, leadDays, today, now, history: recorded, previous })
    if (candidate) addCandidate(candidates, candidate)
    else {
      // A still-future entry is valid even when a prior reconciliation supplied it.
      // Keeping it in the plan avoids cancelling a notification whose schedule is intact.
      const key = reminderKey('period', prediction.startDate)
      const priorAt = normalizeAt(prior.get(key)?.at)
      const daysUntil = dateDifference(today, prediction.startDate)
      if (!recorded.has(key) && priorAt && new Date(priorAt).getTime() > now.getTime()
        && daysUntil !== null && daysUntil >= 0 && daysUntil <= leadDays) {
        addCandidate(candidates, makePeriodCandidate(prediction, daysUntil, new Date(priorAt)))
      }
    }
  }

  const upcoming = [...candidates.values()]
    .filter((candidate) => typeof candidate.at === 'string' && normalizeAt(candidate.at))
    .sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key))
    .slice(0, MAX_PLAN_ENTRIES)
  return stableIds(upcoming, previous)
}

function pendingNotifications(value) {
  if (Array.isArray(value)) return value
  if (value && Array.isArray(value.notifications)) return value.notifications
  return []
}

function pendingOwner(notification) {
  const id = normalizeId(notification?.id)
  const extra = notification?.extra || notification?.data || {}
  return extra.owner === OWNER || ownId(id)
}

function notificationAt(notification) {
  return normalizeAt(notification?.schedule?.at ?? notification?.at)
}

function metadata(entry) {
  return {
    key: entry.key,
    id: normalizeId(entry.id),
    at: normalizeAt(entry.at),
    title: entry.title,
    body: entry.body,
  }
}

function priorMetadataById(previous) {
  const result = new Map()
  previousEntries(previous).forEach((entry) => {
    const id = normalizeId(entry.id)
    if (id !== null && !result.has(id)) result.set(id, entry)
  })
  return result
}

function sameNotification(notification, desired, previous) {
  const prior = previous?.get(normalizeId(desired.id))
  const actualAt = notificationAt(notification)
  const knownAt = actualAt || normalizeAt(prior?.at)
  const atMatches = knownAt ? knownAt === desired.at : false
  const titleMatches = typeof notification.title === 'string'
    ? notification.title === desired.title
    : (!prior || prior.title === desired.title)
  const bodyMatches = typeof notification.body === 'string'
    ? notification.body === desired.body
    : (!prior || prior.body === desired.body)
  return atMatches && titleMatches && bodyMatches
}

async function reconcileOnce(plugin, plan, previous) {
  const desired = Array.isArray(plan) ? plan.filter((entry) => entry && ownId(normalizeId(entry.id)) && typeof entry.key === 'string') : []
  const desiredById = new Map(desired.map((entry) => [normalizeId(entry.id), entry]))
  const pending = pendingNotifications(await plugin.getPending())
  const ownedPending = pending.filter(pendingOwner)
  const prior = priorMetadataById(previous)
  const cancelIds = new Set()

  ownedPending.forEach((notification) => {
    const id = normalizeId(notification.id)
    const wanted = desiredById.get(id)
    if (!wanted || !sameNotification(notification, wanted, prior)) cancelIds.add(id)
  })

  const cancelList = [...cancelIds].filter((id) => id !== null).map((id) => ({ id }))
  if (cancelList.length) await plugin.cancel({ notifications: cancelList })

  const pendingIds = new Set(ownedPending.map((notification) => normalizeId(notification.id)))
  const missing = desired.filter((entry) => !pendingIds.has(normalizeId(entry.id)) || cancelIds.has(normalizeId(entry.id)))
  if (missing.length) {
    await plugin.schedule({
      notifications: missing.map((entry) => ({
        id: normalizeId(entry.id),
        title: entry.title,
        body: entry.body,
        schedule: { at: new Date(entry.at) },
        extra: { owner: OWNER, key: entry.key },
        sound: 'default',
      })),
    })
  }

  const result = desired.map(metadata)
  const resultKeys = new Set(result.map((entry) => entry.key))
  const nowMs = Date.now()
  const historicalPeriod = previousEntries(previous)
    .filter((entry) => {
      const at = normalizeAt(entry.at)
      return typeof entry.key === 'string'
        && entry.key.startsWith('period:')
        && !resultKeys.has(entry.key)
        && at !== null
        && new Date(at).getTime() <= nowMs
    })
    .map(metadata)
    .filter((entry) => ownId(entry.id) && entry.at !== null && entry.title && entry.body)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, Math.max(0, MAX_PREVIOUS_ENTRIES - result.length))
  return [...result, ...historicalPeriod]
}

export function createNativeReminderReconciler(plugin) {
  if (!plugin || typeof plugin.getPending !== 'function' || typeof plugin.schedule !== 'function' || typeof plugin.cancel !== 'function') {
    throw new TypeError('A local notifications plugin with getPending, schedule, and cancel is required')
  }
  let queue = Promise.resolve()
  return function reconcile(plan, previous = []) {
    const run = queue.then(() => reconcileOnce(plugin, plan, previous))
    queue = run.catch(() => undefined)
    return run
  }
}

export const nativeReminderLimits = Object.freeze({ MIN_NATIVE_ID, MAX_NATIVE_ID, MAX_PLAN_ENTRIES, MAX_PREVIOUS_ENTRIES })
