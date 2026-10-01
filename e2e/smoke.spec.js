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
