const EMAILJS_CDN = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
const DEFAULT_SERVICE_ID = 'service_0id1myu'
const DEFAULT_TEMPLATE_ID = 'template_rq0w2am'
const DEFAULT_PUBLIC_KEY = 'P_OGJ56eorjovyNbb'
let sdkPromise

function getConfig() {
  return {
    serviceId: import.meta.env?.VITE_EMAILJS_SERVICE_ID || DEFAULT_SERVICE_ID,
    templateId: import.meta.env?.VITE_EMAILJS_TEMPLATE_ID || DEFAULT_TEMPLATE_ID,
    publicKey: import.meta.env?.VITE_EMAILJS_PUBLIC_KEY || DEFAULT_PUBLIC_KEY,
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

export async function sendReminderEmail({ toEmail, reminderType, message, reminderDate }) {
  if (!validEmail(toEmail)) return { ok: false, error: 'Email nhận không hợp lệ.' }
  const config = getConfig()
  try {
    const emailjs = await loadSdk()
    emailjs.init({ publicKey: config.publicKey })
    await emailjs.send(config.serviceId, config.templateId, {
      to_email: toEmail.trim(),
      reminder_type: reminderType,
      message,
      reminder_date: reminderDate,
      app_name: 'Ngày Đỏ',
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'Không thể gửi email lúc này.' }
  }
}

export { validEmail }
