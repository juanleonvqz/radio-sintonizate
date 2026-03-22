import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'

export default defineConfig({
  // 'server' mode lets the RSS feed endpoint run server-side on Cloudflare Pages
  output: 'server',
  adapter: cloudflare(),

  // Vite config — exposes env vars to client scripts via import.meta.env
  vite: {
    define: {},
  },
})
