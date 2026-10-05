import test from 'node:test'
import assert from 'node:assert/strict'
import { sendReminderEmail, validEmail } from './emailService.js'

test('email adapter validates recipient addresses', async () => {
  assert.equal(validEmail('yennhivo03022000@gmail.com'), true)
  assert.equal(validEmail('not-an-email'), false)
  assert.deepEqual(await sendReminderEmail({ toEmail: 'not-an-email' }), {
    ok: false,
    error: 'Email nhận không hợp lệ.',
  })
})

test('email adapter sends the configured reminder payload', async () => {
  const previousWindow = globalThis.window
  const calls = []
  globalThis.window = {
    emailjs: {
      init: (options) => calls.push({ type: 'init', options }),
      send: async (serviceId, templateId, payload) => {
        calls.push({ type: 'send', serviceId, templateId, payload })
      },
    },
  }

  try {
    assert.deepEqual(await sendReminderEmail({
      toEmail: 'yennhivo03022000@gmail.com',
      reminderType: 'Kỳ kinh sắp tới',
      message: 'Kỳ kinh tiếp theo có thể bắt đầu sau 3 ngày.',
      reminderDate: '2026-10-08',
    }), { ok: true })
    assert.equal(calls[0].type, 'init')
    assert.equal(calls[1].serviceId, 'service_0id1myu')
    assert.equal(calls[1].templateId, 'template_rq0w2am')
    assert.deepEqual(calls[1].payload, {
      to_email: 'yennhivo03022000@gmail.com',
      reminder_type: 'Kỳ kinh sắp tới',
      message: 'Kỳ kinh tiếp theo có thể bắt đầu sau 3 ngày.',
      reminder_date: '2026-10-08',
      app_name: 'Ngày Đỏ',
    })
  } finally {
    globalThis.window = previousWindow
  }
})

test('email adapter returns a safe error when EmailJS fails', async () => {
  const previousWindow = globalThis.window
  globalThis.window = {
    emailjs: {
      init() {},
      send: async () => { throw new Error('network failure') },
    },
  }

  try {
    assert.deepEqual(await sendReminderEmail({
      toEmail: 'yennhivo03022000@gmail.com',
      reminderType: 'Kỳ kinh sắp tới',
      message: 'Nhắc nhở',
      reminderDate: '2026-10-08',
    }), { ok: false, error: 'Không thể gửi email lúc này.' })
  } finally {
    globalThis.window = previousWindow
  }
})
