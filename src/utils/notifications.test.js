import test from 'node:test'
import assert from 'node:assert/strict'
import { Capacitor } from '@capacitor/core'
import {
  createBoundedNativeNotificationPlugin,
  createNativeNotificationAdapter,
  getNativeNotificationPlugin,
  getNotificationPermission,
  isNotificationSupported,
  NativeNotificationTimeoutError,
  requestNotificationPermission,
  showBrowserNotification,
  withNativeNotificationTimeout,
} from './notifications.js'

test('async plugin loader boxes the real Capacitor proxy instead of assimilating its then method', async () => {
  const originalAvailable = Capacitor.isPluginAvailable
  Capacitor.isPluginAvailable = () => true
  try {
    const loaded = await withNativeNotificationTimeout(getNativeNotificationPlugin(), 'load regression', 1000)
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    assert.equal(loaded.plugin, LocalNotifications)
    assert.equal(typeof LocalNotifications.then, 'function')
    assert.equal(loaded.then, undefined)
  } finally {
    Capacitor.isPluginAvailable = originalAvailable
  }
})

test('missing native registration reports a rebuild instruction', async () => {
  const originalAvailable = Capacitor.isPluginAvailable
  Capacitor.isPluginAvailable = () => false
  try {
    await assert.rejects(getNativeNotificationPlugin(), /sync lại iOS rồi chạy lại app từ Xcode/)
  } finally {
    Capacitor.isPluginAvailable = originalAvailable
  }
})

test('native calls time out without reporting a fabricated denied permission', async () => {
  const adapter = createNativeNotificationAdapter({
    checkPermissions: () => new Promise(() => {}),
    requestPermissions: () => new Promise(() => {}),
  }, { permissionCheck: 10, permissionRequest: 10 })
  await assert.rejects(adapter.checkPermission(), NativeNotificationTimeoutError)
  await assert.rejects(adapter.requestPermission(), (error) => error.code === 'NATIVE_NOTIFICATION_TIMEOUT')
})

test('timed out permission requests remain single-flight and can settle later', async () => {
  let resolveRequest
  let calls = 0
  const adapter = createNativeNotificationAdapter({
    requestPermissions() {
      calls += 1
      return new Promise((resolve) => { resolveRequest = resolve })
    },
  }, { permissionRequest: 10 })
  await assert.rejects(adapter.requestPermission(), NativeNotificationTimeoutError)
  await assert.rejects(adapter.requestPermission(), NativeNotificationTimeoutError)
  assert.equal(calls, 1)
  const retry = adapter.requestPermission()
  resolveRequest({ display: 'granted' })
  assert.equal(await retry, 'granted')
  assert.equal(calls, 1)
})

test('native test scheduling failures and hangs are bounded', async () => {
  const adapter = createNativeNotificationAdapter({
    checkPermissions: async () => ({ display: 'granted' }),
    schedule: () => new Promise(() => {}),
  }, { operation: 10 })
  await assert.rejects(adapter.showTest(), NativeNotificationTimeoutError)
})

test('bounded notification mutations do not race an unresolved schedule', async () => {
  let completeSchedule
  let pendingCalls = 0
  const plugin = createBoundedNativeNotificationPlugin({
    schedule: () => new Promise((resolve) => { completeSchedule = resolve }),
    getPending: async () => { pendingCalls += 1; return { notifications: [] } },
  }, 10)
  await assert.rejects(plugin.schedule({ notifications: [] }), NativeNotificationTimeoutError)
  await assert.rejects(plugin.getPending(), NativeNotificationTimeoutError)
  assert.equal(pendingCalls, 0)
  completeSchedule()
  assert.deepEqual(await plugin.getPending(), { notifications: [] })
  assert.equal(pendingCalls, 1)
})

test('timeout helper clears timers on success and propagates rejection', async () => {
  assert.equal(await withNativeNotificationTimeout(() => 42, 'success', 10), 42)
  await assert.rejects(withNativeNotificationTimeout(() => { throw new Error('native failure') }, 'failure', 10), /native failure/)
})

test('notification adapter handles an unsupported browser', async () => {
  const previous = globalThis.window
  delete globalThis.window
  assert.equal(isNotificationSupported(), false)
  assert.equal(getNotificationPermission(), 'unsupported')
  assert.equal(await requestNotificationPermission(), 'unsupported')
  assert.equal(showBrowserNotification({ title: 'x', body: 'y' }), false)
  globalThis.window = previous
})

test('native notification adapter requests permission and schedules a test notification', async () => {
  const calls = []
  const plugin = {
    async checkPermissions() { return { display: 'granted' } },
    async requestPermissions() { return { display: 'granted' } },
    async schedule(payload) { calls.push(payload) },
  }
  const adapter = createNativeNotificationAdapter(plugin)
  assert.equal(await adapter.checkPermission(), 'granted')
  assert.equal(await adapter.requestPermission(), 'granted')
  assert.equal(await adapter.showTest(), true)
  assert.equal(calls[0].notifications[0].id, 2147483640)
  assert.equal(calls[0].notifications[0].extra.owner, 'day-red-test')
})

test('native permissions are not fabricated and scheduling errors are reported', async () => {
  let display = 'prompt'
  const plugin = {
    async checkPermissions() { return { display } },
    async requestPermissions() { return { display: 'denied' } },
    async schedule() { throw new Error('native failure') },
  }
  const adapter = createNativeNotificationAdapter(plugin)
  assert.equal(await adapter.checkPermission(), 'default')
  assert.equal(await adapter.requestPermission(), 'denied')
  assert.equal(await adapter.showTest(), false)
  display = 'granted'
  await assert.rejects(adapter.showTest(), /native failure/)
})

test('notification adapter requests permission and shows a notification', async () => {
  const created = []
  const previous = globalThis.window
  globalThis.window = {
    Notification: class MockNotification {
      static permission = 'default'
      static requestPermission = async () => { MockNotification.permission = 'granted'; return 'granted' }
      constructor(title, options) { created.push({ title, options }) }
    },
  }
  assert.equal(await requestNotificationPermission(), 'granted')
  assert.equal(showBrowserNotification({ title: 'Nhắc', body: 'Uống nước', tag: 'water:today' }), true)
  assert.deepEqual(created, [{ title: 'Nhắc', options: { body: 'Uống nước', tag: 'water:today' } }])
  globalThis.window = previous
})
