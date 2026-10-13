import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { variantFromEnv, writeBuildMarker } from './scripts/nativeVariant.js'

function nativeVariantPlugin(variant) {
  return {
    name: 'native-variant-marker',
    apply: 'build',
    closeBundle() {
      writeBuildMarker('dist', variant)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const variant = variantFromEnv({ ...env, ...process.env })

  return {
    plugins: [react(), nativeVariantPlugin(variant)],
    base: './',
    build: {
      outDir: 'dist',
    },
  }
})
