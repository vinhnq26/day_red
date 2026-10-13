export function normalizeConfig(env = {}) {
  const value = (key, fallback = '') => typeof env[key] === 'string' ? env[key].trim() : fallback
  const variant = value('VITE_APP_VARIANT', 'personal').toLowerCase()
  if (!['personal', 'commercial'].includes(variant)) throw new Error(`Unknown app variant: ${variant}`)
  const isCommercial = variant === 'commercial'
  return Object.freeze({
    variant,
    isCommercial,
    appName: value('VITE_APP_NAME', 'Ngày Đỏ'),
    nativeAppName: value('VITE_NATIVE_APP_NAME', isCommercial ? 'Ngày Đỏ' : 'Day Red'),
    greetingName: value('VITE_DEFAULT_GREETING_NAME'),
    supportEmail: value('VITE_SUPPORT_EMAIL'),
    defaultProfileEmail: value('VITE_DEFAULT_PROFILE_EMAIL'),
    emailServiceId: value('VITE_EMAILJS_SERVICE_ID'),
    emailTemplateId: value('VITE_EMAILJS_TEMPLATE_ID'),
    emailPublicKey: value('VITE_EMAILJS_PUBLIC_KEY'),
  })
}

export const appConfig = normalizeConfig(import.meta.env || {})
