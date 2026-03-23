import { defineConfig } from 'astro/config'   // Astro's config helper — gives you autocomplete
import cloudflare from '@astrojs/cloudflare'   // Tells Astro to build for Cloudflare Pages
import sitemap from '@astrojs/sitemap'         // Plugin that auto-generates sitemap.xml

export default defineConfig({

  site: 'https://radiosintonizate.com',  
  // Your public URL — sitemap and Open Graph need this to build absolute URLs
  // Without it, sitemap entries would have no domain

  output: 'server',                      
  // How Astro builds the project
  // 'server' = pages render on-demand on Cloudflare's edge (needed for /feed.xml and /api/episodes)
  // 'static' = everything pre-built at deploy time (simpler but can't run server code)

  adapter: cloudflare(),                 
  // The bridge between Astro's server output and Cloudflare Pages specifically
  // Without this, 'output: server' wouldn't know how to run on Cloudflare

  integrations: [sitemap()],             
  // List of Astro plugins — sitemap() hooks into every build and
  // automatically writes /sitemap-index.xml listing all your pages

})