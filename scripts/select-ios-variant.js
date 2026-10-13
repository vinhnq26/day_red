import fs from 'node:fs'
import {
  IOS_VARIANTS,
  NATIVE_CONFIG_PATH,
  PBXPROJ_PATH,
  normalizeVariant,
  variantConfig,
} from './nativeVariant.js'

function replaceBuildSetting(source, name, value) {
  const pattern = new RegExp(`^([\\t ]*${name} = ).*;$`, 'gm')
  let count = 0
  const updated = source.replace(pattern, (_match, prefix) => {
    count += 1
    return `${prefix}${value};`
  })
  if (count !== 2) {
    throw new Error(`Expected exactly two ${name} entries in ${PBXPROJ_PATH}; found ${count}`)
  }
  return updated
}

function selectNativeVariant(value) {
  const config = variantConfig(value)
  let pbxproj = fs.readFileSync(PBXPROJ_PATH, 'utf8')
  pbxproj = replaceBuildSetting(pbxproj, 'APP_DISPLAY_NAME', JSON.stringify(config.appName))
  pbxproj = replaceBuildSetting(pbxproj, 'APP_VARIANT', config.variant)
  pbxproj = replaceBuildSetting(pbxproj, 'INFOPLIST_KEY_CFBundleDisplayName', JSON.stringify(config.appName))
  pbxproj = replaceBuildSetting(pbxproj, 'PRODUCT_BUNDLE_IDENTIFIER', config.appId)

  fs.writeFileSync(PBXPROJ_PATH, pbxproj)
  if (fs.existsSync(NATIVE_CONFIG_PATH)) {
    const nativeConfig = JSON.parse(fs.readFileSync(NATIVE_CONFIG_PATH, 'utf8'))
    nativeConfig.appId = config.appId
    nativeConfig.appName = config.appName
    nativeConfig.appVariant = config.variant
    fs.writeFileSync(NATIVE_CONFIG_PATH, `${JSON.stringify(nativeConfig, null, '\t')}\n`)
  }
  return config
}

export function main(argv = process.argv) {
  const requested = argv[2]
  if (!requested || argv.length !== 3) {
    console.error('Usage: node scripts/select-ios-variant.js personal|commercial')
    return 1
  }
  try {
    const config = selectNativeVariant(normalizeVariant(requested))
    console.log(`Selected iOS ${config.variant} variant: ${config.appId} (${config.appName})`)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
}

if (process.argv[1] && process.argv[1].endsWith('/select-ios-variant.js')) {
  process.exitCode = main()
}

export { selectNativeVariant, IOS_VARIANTS }
