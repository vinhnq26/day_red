import { defineConfig } from '@playwright/test'

const variant = process.env.APP_VARIANT === 'commercial' ? 'commercial' : 'personal'
const port = Number(process.env.PLAYWRIGHT_PORT) || (variant === 'commercial' ? 5174 : 5173)

export default defineConfig({
  testDir: './e2e',
  testIgnore: variant === 'commercial' ? ['**/smoke.spec.js'] : ['**/commercial-profile.spec.js'],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox'],
    },
    viewport: { width: 390, height: 844 },
  },
  webServer: { command: `npm run dev:${variant} -- --host 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
})
