import { defineConfig } from '@solidjs/start/config'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  ssr: false,
  server: {
    preset: 'cloudflare-module',
  },
  middleware: 'src/middleware.ts',
  vite: {
    plugins: [UnoCSS()],
    optimizeDeps: {
      exclude: ['@rttnd/gau'],
    },
    ssr: { external: ['drizzle-orm'] },
  },
})
