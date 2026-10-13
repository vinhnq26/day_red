import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig } from './appConfig.js'

test('config accepts personal client values without commercial fields', () => {
  const config = normalizeConfig({
    VITE_APP_VARIANT: 'personal',
    VITE_DEFAULT_GREETING_NAME: 'bé Nhii',
    VITE_DEFAULT_PROFILE_EMAIL: 'yennhivo03022000@gmail.com',
  })
  assert.equal(config.variant, 'personal')
  assert.equal(config.isCommercial, false)
  assert.equal(config.greetingName, 'bé Nhii')
  assert.equal(config.defaultProfileEmail, 'yennhivo03022000@gmail.com')
})

test('commercial config keeps optional identity fields empty', () => {
  const config = normalizeConfig({ VITE_APP_VARIANT: 'commercial' })
  assert.equal(config.variant, 'commercial')
  assert.equal(config.isCommercial, true)
  assert.equal(config.greetingName, '')
  assert.equal(config.defaultProfileEmail, '')
  assert.equal(config.supportEmail, '')
})

test('config trims supported environment values and rejects unknown variants', () => {
  const config = normalizeConfig({ VITE_APP_VARIANT: ' COMMERCIAL ', VITE_APP_NAME: '  Brand  ' })
  assert.equal(config.appName, 'Brand')
  assert.throws(() => normalizeConfig({ VITE_APP_VARIANT: 'staging' }), /Unknown app variant/)
})
