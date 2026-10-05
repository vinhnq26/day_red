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
