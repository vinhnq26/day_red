export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported'
  return window.Notification.permission || 'default'
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported'
  try {
    return await window.Notification.requestPermission()
  } catch {
    return 'default'
  }
}

export function showBrowserNotification({ title, body, tag }) {
  if (!isNotificationSupported() || getNotificationPermission() !== 'granted') return false
  try {
    new window.Notification(title, { body, tag })
    return true
  } catch {
    return false
  }
}
