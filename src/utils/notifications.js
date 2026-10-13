import { Capacitor } from '@capacitor/core'

export const nativeNotificationTimeouts = Object.freeze({
  pluginImport: 10_000,
  permissionCheck: 15_000,
  permissionRequest: 60_000,
  operation: 15_000,
})

export class NativeNotificationTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`iPhone chưa trả kết quả ở bước ${operation}. Chưa thể xác nhận kết quả; nếu hộp thoại quyền đang mở, hãy chọn trong hộp thoại. Nếu không có hộp thoại, hãy mở lại app và kiểm tra bản build iOS trong Xcode.`)
    this.name = 'NativeNotificationTimeoutError'
    this.code = 'NATIVE_NOTIFICATION_TIMEOUT'
    this.operation = operation
    this.timeoutMs = timeoutMs
  }
}

export function withNativeNotificationTimeout(operation, label, timeoutMs = nativeNotificationTimeouts.operation) {
  let timer
  const started = Date.now()
  console.info('[Day Red notifications]', label, 'start')
  const task = Promise.resolve().then(() => (typeof operation === 'function' ? operation() : operation))
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new NativeNotificationTimeoutError(label, timeoutMs)), timeoutMs)
  })
  return Promise.race([task, timeout]).finally(() => {
    clearTimeout(timer)
    console.info('[Day Red notifications]', label, 'end', `${Date.now() - started}ms`)
  })
}

export function isNativeNotificationPlatform() {
  return Capacitor.isNativePlatform()
}

export function isNotificationSupported() {
  return isNativeNotificationPlatform() || (typeof window !== 'undefined' && 'Notification' in window)
}

export function getNotificationPermission() {
  if (isNativeNotificationPlatform()) return 'default'
  if (!isNotificationSupported()) return 'unsupported'
  return window.Notification.permission || 'default'
}

export async function getNativeNotificationPlugin() {
  if (!Capacitor.isPluginAvailable('LocalNotifications')) {
    throw new Error('Plugin thông báo chưa được đồng bộ. Hãy build và sync lại iOS rồi chạy lại app từ Xcode.')
  }
  const { LocalNotifications } = await withNativeNotificationTimeout(
    () => import('@capacitor/local-notifications'),
    'nạp plugin LocalNotifications',
    nativeNotificationTimeouts.pluginImport,
  )
  // Capacitor proxies synthesize a `then` method. Returning the proxy from an
  // async function makes Promise resolution call LocalNotifications.then().
  return { plugin: LocalNotifications }
}

export function createBoundedNativeNotificationPlugin(plugin, timeoutMs = nativeNotificationTimeouts.operation) {
  let pendingMutation = null
  const mutate = async (method, args, label) => {
    // A timeout cannot cancel iOS work. Do not overlap a late cancel/schedule
    // with a new reconciliation using different data.
    if (pendingMutation) await withNativeNotificationTimeout(pendingMutation, 'chờ thao tác iOS trước đó', timeoutMs)
    const task = Promise.resolve().then(() => plugin[method](...args))
    pendingMutation = task
    task.then(() => { pendingMutation = null }, () => { pendingMutation = null })
    return withNativeNotificationTimeout(task, label, timeoutMs)
  }
  return {
    getPending: async (...args) => {
      if (pendingMutation) await withNativeNotificationTimeout(pendingMutation, 'chờ thao tác iOS trước đó', timeoutMs)
      return withNativeNotificationTimeout(() => plugin.getPending(...args), 'đọc lịch thông báo', timeoutMs)
    },
    cancel: (...args) => mutate('cancel', args, 'hủy lịch thông báo cũ'),
    schedule: (...args) => mutate('schedule', args, 'đặt lịch thông báo'),
  }
}

function normalizePermission(display) {
  return display === 'granted' || display === 'denied' ? display : 'default'
}

export function createNativeNotificationAdapter(plugin, timeoutOverrides = {}) {
  const timeouts = { ...nativeNotificationTimeouts, ...timeoutOverrides }
  let permissionRequest = null
  const requestNativePermission = () => {
    if (!permissionRequest) {
      permissionRequest = Promise.resolve()
        .then(() => plugin.requestPermissions())
        .finally(() => { permissionRequest = null })
    }
    return withNativeNotificationTimeout(
      permissionRequest,
      'xin quyền thông báo',
      timeouts.permissionRequest,
    )
  }
  return {
    async checkPermission() {
      const result = await withNativeNotificationTimeout(
        () => plugin.checkPermissions(),
        'kiểm tra quyền thông báo',
        timeouts.permissionCheck,
      )
      return normalizePermission(result.display)
    },
    async requestPermission() {
      const result = await requestNativePermission()
      return normalizePermission(result.display)
    },
    async showTest() {
      if (normalizePermission((await withNativeNotificationTimeout(
        () => plugin.checkPermissions(),
        'kiểm tra quyền trước khi thử thông báo',
        timeouts.permissionCheck,
      )).display) !== 'granted') return false
      await withNativeNotificationTimeout(
        () => plugin.schedule({ notifications: [{
          id: 2147483640,
          title: 'Thông báo thử',
          body: 'Nhắc nhở iPhone đang hoạt động ♥',
          schedule: { at: new Date(Date.now() + 5000) },
          sound: 'default',
          extra: { owner: 'day-red-test' },
        }] }),
        'đặt thông báo thử',
        timeouts.operation,
      )
      return true
    },
  }
}

const nativeAdapters = new WeakMap()

function nativeAdapter(plugin) {
  if (!nativeAdapters.has(plugin)) nativeAdapters.set(plugin, createNativeNotificationAdapter(plugin))
  return nativeAdapters.get(plugin)
}

export async function checkNotificationPermission() {
  if (!isNativeNotificationPlatform()) return getNotificationPermission()
  const { plugin } = await getNativeNotificationPlugin()
  return nativeAdapter(plugin).checkPermission()
}

export async function requestNotificationPermission() {
  if (isNativeNotificationPlatform()) {
    const { plugin } = await getNativeNotificationPlugin()
    return nativeAdapter(plugin).requestPermission()
  }
  if (!isNotificationSupported()) return 'unsupported'
  try {
    return await window.Notification.requestPermission()
  } catch {
    return 'default'
  }
}

export function showBrowserNotification({ title, body, tag }) {
  if (isNativeNotificationPlatform() || !isNotificationSupported() || getNotificationPermission() !== 'granted') return false
  try {
    new window.Notification(title, { body, tag })
    return true
  } catch {
    return false
  }
}

export async function showTestNotification() {
  if (!isNativeNotificationPlatform()) {
    return showBrowserNotification({ title: 'Thông báo thử', body: 'Thông báo trên thiết bị đang hoạt động.', tag: 'day-red:test' })
  }
  const { plugin } = await getNativeNotificationPlugin()
  return nativeAdapter(plugin).showTest()
}
