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

test('commercial onboarding accepts optional profile details and settings can edit them', async ({ page }) => {
  await expect(page.locator('#onboarding-profile-name')).toBeVisible()
  await expect(page.locator('#onboarding-profile-email')).toBeVisible()
  await page.locator('#onboarding-profile-name').fill('Linh')
  await page.locator('#onboarding-profile-email').fill('linh@example.com')
  await page.locator('#period-date').fill(dateKey(-1))
  await page.getByRole('button', { name: /Lưu ngày bắt đầu thực tế/ }).click()

  await expect(page.getByRole('heading', { name: /Linh nhé/ })).toBeVisible()
  const firstState = await page.evaluate(() => JSON.parse(localStorage.getItem('day-red-state-commercial-v1')).state)
  expect(firstState.profile).toEqual({ name: 'Linh', email: 'linh@example.com' })

  await page.getByRole('button', { name: 'Mở cài đặt' }).click()
  await page.locator('#settings-profile-name').fill('Mai')
  await page.locator('#settings-profile-email').fill('mai@example.com')
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await page.reload()

  await expect(page.getByRole('heading', { name: /Mai nhé/ })).toBeVisible()
  const updatedState = await page.evaluate(() => JSON.parse(localStorage.getItem('day-red-state-commercial-v1')).state)
  expect(updatedState.profile).toEqual({ name: 'Mai', email: 'mai@example.com' })
  expect(updatedState.settings.reminders.emailAddress).toBe('mai@example.com')
})

test('commercial onboarding permits blank profile fields', async ({ page }) => {
  await page.locator('#period-date').fill(dateKey(-1))
  await page.getByRole('button', { name: /Lưu ngày bắt đầu thực tế/ }).click()
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('day-red-state-commercial-v1')).state)
  expect(state.profile).toEqual({ name: '', email: '' })
})
