import { dateDifference } from './dateUtils.js'
import { getCurrentPrediction, getStatus } from './cycleUtils.js'

function validTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function reminderKey(type, date, time = '') {
  return `${type}:${date}${time ? `:${time}` : ''}`
}

export function getReminderCandidates({
  latest,
  cycleLength,
  periodLength,
  today,
  now = new Date(),
  preferences = {},
  history = [],
} = {}) {
  const candidates = []
  const status = getStatus(latest, cycleLength, periodLength, today)
  const prediction = getCurrentPrediction(latest, cycleLength, periodLength)
  const recorded = new Set(Array.isArray(history) ? history : [])
  const leadDays = Number.isInteger(preferences.leadDays) ? Math.max(1, Math.min(7, preferences.leadDays)) : 3

  if (preferences.periodEnabled !== false && prediction && status.type !== 'period') {
    const days = dateDifference(today, prediction.startDate)
    if (days !== null && days >= 0 && days <= leadDays) {
      const key = reminderKey('period', prediction.startDate)
      if (!recorded.has(key)) {
        candidates.push({
          key,
          type: 'period',
          daysUntil: days,
          reminderDate: prediction.startDate,
          title: days === 0 ? 'Có thể tới kỳ hôm nay' : 'Kỳ kinh sắp tới',
          body: days === 0
            ? 'Hãy chuẩn bị nhẹ nhàng và lắng nghe cơ thể của bạn.'
            : `Kỳ kinh tiếp theo có thể bắt đầu sau ${days} ngày.`,
        })
      }
    }
  }

  if (preferences.waterEnabled !== false && status.type === 'period') {
    const currentMinutes = now instanceof Date && !Number.isNaN(now.getTime())
      ? now.getHours() * 60 + now.getMinutes()
      : null
    const times = Array.isArray(preferences.waterTimes) ? preferences.waterTimes.filter(validTime) : []
    const dueTime = currentMinutes === null
      ? null
      : times.find((item) => {
          const [hours, minutes] = item.split(':').map(Number)
          const elapsed = currentMinutes - (hours * 60 + minutes)
          return elapsed >= 0 && elapsed <= 1
        })
    if (dueTime) {
      const key = reminderKey('water', today, dueTime)
      if (!recorded.has(key)) {
        candidates.push({
          key,
          type: 'water',
          title: 'Đã đến lúc uống nước',
          body: 'Uống một ly nước và chăm sóc cơ thể trong những ngày này nhé.',
        })
      }
    }
  }

  return candidates
}
