import { spawnSync } from 'node:child_process'
import { assertBuildMarker, assertNativeVariant, normalizeVariant } from './nativeVariant.js'
import { selectNativeVariant } from './select-ios-variant.js'

const requested = process.argv[2]
if (!requested || process.argv.length !== 3) {
  console.error('Usage: node scripts/sync-ios-variant.js personal|commercial')
  process.exitCode = 1
} else {
  try {
    const variant = normalizeVariant(requested)
    assertBuildMarker(variant)
    selectNativeVariant(variant)
    assertNativeVariant(variant)
    const result = spawnSync('npx', ['cap', 'sync', 'ios'], {
      cwd: process.cwd(),
      env: { ...process.env, CAPACITOR_APP_VARIANT: variant },
      stdio: 'inherit',
    })
    process.exitCode = result.status ?? 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
