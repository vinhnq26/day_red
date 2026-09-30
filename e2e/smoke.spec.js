import { test, expect } from '@playwright/test'

test('new user can set up a cycle and see predictions', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Bắt đầu theo dõi' })).toBeVisible()
  await page.locator('#period-date').fill('2026-09-30')
  await page.getByRole('button', { name: /^24/ }).click()
  await page.getByRole('button', { name: /Bắt đầu theo dõi/ }).click()
  await expect(page.getByText('KỲ KINH TIẾP THEO · DỰ KIẾN')).toBeVisible()
  await expect(page.getByText('Còn 24 ngày nữa')).toBeVisible()
  await page.locator('.nav-item').filter({ hasText: 'Lịch' }).click()
  await expect(page.getByRole('heading', { name: 'Nhìn lại nhịp riêng.' })).toBeVisible()
  await expect(page.getByText('Đã ghi')).toBeVisible()
})
