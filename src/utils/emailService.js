const EMAILJS_CDN = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
import { appConfig } from '../config/appConfig.js'
let sdkPromise

function getConfig(config = appConfig) {
  return {
    serviceId: config.emailServiceId,
    templateId: config.emailTemplateId,
    publicKey: config.emailPublicKey,
    appName: config.appName,
  }
}

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function loadSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('EmailJS chỉ hoạt động trên trình duyệt.'))
  if (window.emailjs) return Promise.resolve(window.emailjs)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = EMAILJS_CDN
    script.async = true
    script.onload = () => window.emailjs ? resolve(window.emailjs) : reject(new Error('Không tải được EmailJS.'))
    script.onerror = () => reject(new Error('Không tải được EmailJS.'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

export async function sendReminderEmail({ toEmail, reminderType, message, reminderDate, config: suppliedConfig }) {
  if (!validEmail(toEmail)) return { ok: false, error: 'Email nhận không hợp lệ.' }
  const config = getConfig(suppliedConfig)
  try {
    const emailjs = await loadSdk()
    emailjs.init({ publicKey: config.publicKey })
    await emailjs.send(config.serviceId, config.templateId, {
      to_email: toEmail.trim(),
      reminder_type: reminderType,
      message,
      reminder_date: reminderDate,
      app_name: config.appName,
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'Không thể gửi email lúc này.' }
  }
}

export { validEmail }
