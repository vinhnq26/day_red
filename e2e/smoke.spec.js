import { test, expect } from '@playwright/test'

function dateKey(offset = 0) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('mobile layout has 32px top clearance without changing desktop spacing', async ({ page }) => {
  await expect(page.locator('.app-shell')).toHaveCSS('padding-top', '32px')
  const header = await page.locator('.topbar').boundingBox()
  expect(header.y).toBeGreaterThanOrEqual(32)
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.locator('.app-shell')).toHaveCSS('padding-top', '0px')
})

test('notification buttons show feedback and reminders default to enabled', async ({ page }) => {
  await page.addInitScript(() => {
    class NotificationMock {
      static permission = 'default'
      static async requestPermission() { NotificationMock.permission = 'granted'; return 'granted' }
      constructor(title) { window.notificationTitles = [...(window.notificationTitles || []), title] }
    }
    Object.defineProperty(window, 'Notification', { value: NotificationMock, configurable: true })
  })
  await page.reload()
  await page.locator('#period-date').fill(dateKey(-1))
  await page.getByRole('button', { name: /Lưu ngày bắt đầu thực tế/ }).click()
  await page.getByRole('button', { name: 'Mở cài đặt' }).click()
  await expect(page.getByLabel('Nhắc gần tới kỳ kinh', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Nhắc uống đủ nước trong kỳ', { exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'Cho phép thông báo', exact: true }).click()
  await expect(page.getByText('Đã cho phép thông báo và cập nhật lịch nhắc', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Thử thông báo', exact: true }).click()
  await expect(page.getByText('Đã gửi thông báo thử', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.notificationTitles)).toContain('Thông báo thử')
})

async function mockNativeNotifications(page, behavior = 'normal') {
  await page.addInitScript((behavior) => {
    window.webkit = { messageHandlers: { bridge: {} } }
    window.nativeNotificationCalls = []
    window.nativeNotificationPayloads = []
    let permission = 'prompt'
    window.Capacitor = {
      PluginHeaders: [{
        name: 'LocalNotifications',
        methods: ['checkPermissions', 'requestPermissions', 'getPending', 'cancel', 'schedule']
          .map((name) => ({ name, rtype: 'promise' }))
          .concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }]),
      }],
      nativeCallback: () => 'listener-id',
      nativePromise: async (plugin, method, options) => {
        window.nativeNotificationCalls.push(method)
        if (behavior === 'permission-hang' && method === 'requestPermissions') return new Promise(() => {})
        if (behavior === 'pending-hang' && method === 'getPending') return new Promise(() => {})
        if (method === 'requestPermissions') { permission = 'granted'; return { display: permission } }
        if (method === 'checkPermissions') return { display: permission }
        if (method === 'getPending') return { notifications: [] }
        if (method === 'schedule') window.nativeNotificationPayloads.push(options)
        return {}
      },
    }
  }, behavior)
  await page.reload()
  await page.getByRole('button', { name: 'Mở cài đặt' }).click()
}

test('native permission and test buttons work through the real Capacitor proxy', async ({ page }) => {
  await mockNativeNotifications(page)
  await page.getByRole('button', { name: 'Cho phép thông báo', exact: true }).click()
  await expect(page.getByText('Đã cho phép thông báo và cập nhật lịch nhắc', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Thử thông báo', exact: true }).click()
  await expect(page.getByText('Đã đặt lịch thử sau 5 giây. Hãy khóa màn hình để kiểm tra.', { exact: true })).toBeVisible()
  const calls = await page.evaluate(() => window.nativeNotificationCalls)
  expect(calls).toContain('requestPermissions')
  expect(calls).toContain('schedule')
  expect(calls).not.toContain('then')
  const payload = await page.evaluate(() => window.nativeNotificationPayloads.at(-1))
  expect(payload.notifications[0].id).toBe(2147483640)
})

test('a stuck native permission request recovers the buttons without repeating the request', async ({ page }) => {
  await mockNativeNotifications(page, 'permission-hang')
  await page.clock.install()
  await page.getByRole('button', { name: 'Cho phép thông báo', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.nativeNotificationCalls.includes('requestPermissions'))).toBe(true)
  await page.clock.fastForward(61_000)
  await expect(page.getByText(/Không thể bật thông báo: iPhone chưa trả kết quả/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cho phép thông báo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Thử thông báo', exact: true }).click()
  await expect(page.getByText('Đang xin quyền để thử thông báo...', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.nativeNotificationCalls.filter((method) => method === 'requestPermissions').length)).toBe(1)
  await page.clock.fastForward(61_000)
  await expect(page.getByRole('button', { name: 'Thử thông báo', exact: true })).toBeEnabled()
})

test('stuck startup reconciliation does not block native test or overwrite its result', async ({ page }) => {
  await mockNativeNotifications(page, 'pending-hang')
  await page.clock.install()
  await expect.poll(() => page.evaluate(() => window.nativeNotificationCalls.includes('getPending'))).toBe(true)
  await page.getByRole('button', { name: 'Cho phép thông báo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Thử thông báo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Thử thông báo', exact: true }).click()
  await expect(page.getByText('Đã đặt lịch thử sau 5 giây. Hãy khóa màn hình để kiểm tra.', { exact: true })).toBeVisible()
  await page.clock.fastForward(31_000)
  await expect(page.getByText('Đã đặt lịch thử sau 5 giây. Hãy khóa màn hình để kiểm tra.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thử thông báo', exact: true })).toBeEnabled()
})

test('new user can set up a cycle and see predictions', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Bắt đầu theo dõi' })).toBeVisible()
  await page.locator('#period-date').fill(dateKey(-1))
  await page.getByRole('button', { name: /^24/ }).click()
  await page.getByRole('button', { name: /Lưu ngày bắt đầu thực tế/ }).click()
  await expect(page.getByText('KỲ KINH TIẾP THEO · DỰ KIẾN')).toBeVisible()
  await expect(page.getByText(/Còn \d+ ngày nữa|Có thể bắt đầu hôm nay|Đã trễ \d+ ngày/)).toBeVisible()
  await page.locator('.nav-item').filter({ hasText: 'Lịch' }).click()
  await expect(page.getByRole('heading', { name: 'Nhìn lại nhịp riêng.' })).toBeVisible()
  await expect(page.getByText('Ngày đèn đỏ')).toBeVisible()
})

test('actual periods stay independent when the current period is edited', async ({ page }) => {
  const previousDate = dateKey(-40)
  const currentDate = dateKey(-10)
  const editedDate = dateKey(-9)

  await page.locator('#period-date').fill(previousDate)
  await page.getByRole('button', { name: /^28/ }).click()
  await page.getByRole('button', { name: /Lưu ngày bắt đầu thực tế/ }).click()
  await page.locator('.nav-item').filter({ hasText: 'Nhật ký' }).click()
  await page.getByRole('button', { name: /Ghi ngày bắt đầu thực tế/ }).click()
  await page.locator('#period-date').fill(currentDate)
  await page.getByRole('button', { name: /Lưu ngày bắt đầu thực tế/ }).click()

  let starts = await page.evaluate(() => JSON.parse(localStorage.getItem('day-red-state-v1')).state.periodLogs.map((log) => log.startDate).sort())
  expect(starts).toEqual([currentDate, previousDate].sort())

  await page.locator('.history-item').first().getByRole('button', { name: 'Chỉnh sửa' }).click()
  await page.locator('#period-date').fill(editedDate)
  await page.getByRole('button', { name: /Lưu thay đổi/ }).click()

  starts = await page.evaluate(() => JSON.parse(localStorage.getItem('day-red-state-v1')).state.periodLogs.map((log) => log.startDate).sort())
  expect(starts).toEqual([editedDate, previousDate].sort())
})

test('calendar can record the selected date as an actual period start', async ({ page }) => {
  const previousDate = dateKey(-10)
  const today = dateKey()

  await page.locator('#period-date').fill(previousDate)
  await page.getByRole('button', { name: /^28/ }).click()
  await page.getByRole('button', { name: /Lưu ngày bắt đầu thực tế/ }).click()
  await page.locator('.nav-item').filter({ hasText: 'Lịch' }).click()

  const selectedDay = page.locator('.day-cell.selected')
  await expect(selectedDay).toHaveAttribute('aria-pressed', 'true')
  await expect(selectedDay).toHaveAttribute('aria-current', 'date')
  await expect(page.getByRole('button', { name: /Ghi ngày bắt đầu thực tế cho ngày đã chọn/ })).toBeVisible()
  await page.getByRole('button', { name: /Ghi ngày bắt đầu thực tế cho ngày đã chọn/ }).click()
  await expect(page.getByRole('dialog', { name: 'Ghi ngày bắt đầu thực tế' })).toBeVisible()
  await expect(page.locator('#period-date')).toHaveValue(today)
  await page.getByRole('button', { name: /Lưu ngày bắt đầu thực tế/ }).click()

  await expect(page.getByText('Đã lưu ngày bắt đầu thực tế')).toBeVisible()
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('day-red-state-v1')).state)
  expect(state.periodLogs.filter((log) => log.startDate === today)).toHaveLength(1)
  await expect(page.locator('.day-cell.confirmed').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Chỉnh ngày bắt đầu cho ngày đã chọn/ })).toBeVisible()
})

test('automatically confirms a prediction that falls today', async ({ page }) => {
  const previousDate = dateKey(-28)
  const previousEndDate = dateKey(-24)
  const today = dateKey()
  await page.evaluate(({ previousDate, previousEndDate }) => {
    localStorage.setItem('day-red-state-v1', JSON.stringify({
      version: 3,
      state: {
        settings: { cycleLength: 40, periodLength: 7 },
        periodLogs: [{ id: 'previous', startDate: previousDate, endDate: previousEndDate, periodLength: 5, cycleLength: 28, symptoms: [], note: '' }],
        dailyLogs: [],
      },
    }))
  }, { previousDate, previousEndDate })
  await page.reload()

  await page.waitForFunction((today) => {
    const stored = JSON.parse(localStorage.getItem('day-red-state-v1'))
    return stored?.state?.periodLogs?.some((log) => log.startDate === today)
  }, today)
  await expect(page.getByText('Đang trong kỳ')).toBeVisible()

  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('day-red-state-v1')).state)
  expect(state.periodLogs.filter((log) => log.startDate === today)).toHaveLength(1)
  expect(state.periodLogs.find((log) => log.id === 'previous')).toMatchObject({ startDate: previousDate, cycleLength: 28 })
  expect(state.periodLogs.find((log) => log.startDate === today)).toMatchObject({ endDate: dateKey(4), cycleLength: 28, periodLength: 5 })

  await page.reload()
  await page.waitForFunction((today) => {
    const stored = JSON.parse(localStorage.getItem('day-red-state-v1'))
    return stored?.state?.periodLogs?.filter((log) => log.startDate === today).length === 1
  }, today)
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('day-red-state-v1')).state)
  expect(state.periodLogs.filter((log) => log.startDate === today)).toHaveLength(1)

  const adjustedDate = dateKey(-1)
  await page.locator('.nav-item').filter({ hasText: 'Nhật ký' }).click()
  await page.getByRole('button', { name: 'Chỉnh sửa' }).first().click()
  await page.locator('#period-date').fill(adjustedDate)
  await page.getByRole('button', { name: /Lưu thay đổi/ }).click()
  await page.waitForFunction(({ today, adjustedDate }) => {
    const stored = JSON.parse(localStorage.getItem('day-red-state-v1'))
    const logs = stored?.state?.periodLogs || []
    return logs.filter((log) => log.startDate === today).length === 0
      && logs.filter((log) => log.startDate === adjustedDate).length === 1
  }, { today, adjustedDate })
})
