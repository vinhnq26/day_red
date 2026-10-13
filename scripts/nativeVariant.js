import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PERSONAL_VARIANT = 'personal'
export const COMMERCIAL_VARIANT = 'commercial'

export const IOS_VARIANTS = Object.freeze({
  [PERSONAL_VARIANT]: Object.freeze({
    appId: 'com.vinhnguyen.dayred',
    appName: 'Day Red',
  }),
  [COMMERCIAL_VARIANT]: Object.freeze({
    appId: 'com.vinhnguyen.dayred.commercial',
    appName: 'Ngày Đỏ',
  }),
})

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PBXPROJ_PATH = path.join(PROJECT_ROOT, 'ios/App/App.xcodeproj/project.pbxproj')
export const NATIVE_CONFIG_PATH = path.join(PROJECT_ROOT, 'ios/App/App/capacitor.config.json')

export function normalizeVariant(value) {
  const variant = String(value || '').trim().toLowerCase()
  if (!Object.hasOwn(IOS_VARIANTS, variant)) {
    throw new Error(`Unsupported iOS variant "${value}". Use personal or commercial.`)
  }
  return variant
}

export function variantFromEnv(env = {}) {
  return normalizeVariant(env.CAPACITOR_APP_VARIANT || env.VITE_APP_VARIANT || PERSONAL_VARIANT)
}

export function variantConfig(value) {
  const variant = normalizeVariant(value)
  return { variant, ...IOS_VARIANTS[variant] }
}

export function readPbxVariant() {
  const pbxproj = fs.readFileSync(PBXPROJ_PATH, 'utf8')
  const markers = [...pbxproj.matchAll(/^\s*APP_VARIANT = ([^;]+);$/gm)].map((match) => match[1])
  if (markers.length !== 2 || markers.some((marker) => marker !== markers[0]) || !IOS_VARIANTS[markers[0]]) {
    throw new Error(`iOS Xcode project is missing a consistent APP_VARIANT in ${PBXPROJ_PATH}`)
  }
  return markers[0]
}

export function readNativeVariant() {
  const nativeConfig = fs.existsSync(NATIVE_CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(NATIVE_CONFIG_PATH, 'utf8'))
    : null
  const pbxproj = fs.readFileSync(PBXPROJ_PATH, 'utf8')
  const bundleIds = [...pbxproj.matchAll(/^\s*PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);$/gm)].map((match) => match[1])
  const displayNames = [...pbxproj.matchAll(/^\s*INFOPLIST_KEY_CFBundleDisplayName = "([^"]+)";$/gm)].map((match) => match[1])
  const markers = [...pbxproj.matchAll(/^\s*APP_VARIANT = ([^;]+);$/gm)].map((match) => match[1])
  const variant = readPbxVariant()

  if (!variant || !IOS_VARIANTS[variant]) {
    throw new Error(`iOS native config is missing a valid appVariant in ${NATIVE_CONFIG_PATH}`)
  }
  const expected = IOS_VARIANTS[variant]
  if (
    (nativeConfig && (nativeConfig.appId !== expected.appId || nativeConfig.appName !== expected.appName || nativeConfig.appVariant !== variant)) ||
    bundleIds.length !== 2 ||
    bundleIds.some((bundleId) => bundleId !== expected.appId) ||
    displayNames.length !== 2 ||
    displayNames.some((displayName) => displayName !== expected.appName) ||
    markers.length !== 2 ||
    markers.some((marker) => marker !== variant)
  ) {
    throw new Error('iOS native files have mismatched variant values; run node scripts/select-ios-variant.js personal|commercial')
  }
  return { variant, ...expected }
}

export function assertNativeVariant(value) {
  const expected = variantConfig(value)
  const actual = readNativeVariant()
  if (actual.variant !== expected.variant) {
    throw new Error(
      `VITE_APP_VARIANT=${expected.variant} does not match the selected iOS native variant=${actual.variant}; ` +
      `run node scripts/select-ios-variant.js ${expected.variant} before Capacitor sync/build`,
    )
  }
  return actual
}

export function assertBuildMarker(value) {
  const config = variantConfig(value)
  const markerPath = path.join(PROJECT_ROOT, 'dist/native-variant.json')
  if (!fs.existsSync(markerPath)) {
    throw new Error(`Missing ${markerPath}; build web assets with VITE_APP_VARIANT=${config.variant} before Capacitor sync/build`)
  }
  let marker
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
  } catch {
    throw new Error(`Invalid native variant marker at ${markerPath}; rebuild web assets with VITE_APP_VARIANT=${config.variant}`)
  }
  if (marker.variant !== config.variant || marker.appId !== config.appId || marker.appName !== config.appName) {
    throw new Error(
      `Web assets are ${marker.variant || 'unknown'} but native iOS is ${config.variant}; ` +
      `rebuild with VITE_APP_VARIANT=${config.variant} before Capacitor sync/build`,
    )
  }
  return marker
}

export function writeBuildMarker(outDir, value) {
  const config = variantConfig(value)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'native-variant.json'),
    `${JSON.stringify({ ...config, generatedBy: 'vite' }, null, 2)}\n`,
  )
}
