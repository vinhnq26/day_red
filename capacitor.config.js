import { loadEnv } from 'vite'
import { assertBuildMarker, readPbxVariant, variantConfig, variantFromEnv } from './scripts/nativeVariant.js'

const requestedVariant = process.env.CAPACITOR_APP_VARIANT || process.env.VITE_APP_VARIANT || readPbxVariant()
const env = loadEnv(requestedVariant, process.cwd(), 'VITE_')
const variant = variantFromEnv({ ...env, ...process.env, CAPACITOR_APP_VARIANT: requestedVariant })
const selected = variantConfig(variant)
const nativeVariant = readPbxVariant()

if (nativeVariant !== variant) {
  throw new Error(
    `Capacitor variant ${variant} does not match the selected iOS native variant ${nativeVariant}; ` +
    `run node scripts/select-ios-variant.js ${variant} before Capacitor sync/build`,
  )
}
assertBuildMarker(variant)

// Capacitor 8 loads JavaScript config files through require(). Named exports keep
// this config compatible with projects using "type": "module".
export const appId = selected.appId
export const appName = selected.appName
export const appVariant = selected.variant
export const webDir = 'dist'
export const plugins = {
  LocalNotifications: {
    presentationOptions: ['banner', 'list', 'sound'],
  },
}
