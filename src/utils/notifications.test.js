import test from 'node:test'
import assert from 'node:assert/strict'
import { getNotificationPermission, isNotificationSupported, requestNotificationPermission, showBrowserNotification } from './notifications.js'

test('notification adapter handles an unsupported browser', async () => {
  const previous = globalThis.window
  delete globalThis.window
  assert.equal(isNotificationSupported(), false)
  assert.equal(getNotificationPermission(), 'unsupported')
  assert.equal(await requestNotificationPermission(), 'unsupported')
  assert.equal(showBrowserNotification({ title: 'x', body: 'y' }), false)
  globalThis.window = previous
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
