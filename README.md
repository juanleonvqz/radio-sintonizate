# Radio Sintonízate

The official radio website of IES El Mayorazgo, La Orotava, Tenerife.

Built with **Astro** + **Supabase** + **Cloudflare Pages**.

---

## Project structure

```
src/
├── components/
│   ├── Header.astro          ← logo, nav, theme toggle
│   ├── DescriptionBanner.astro
│   ├── Player.astro          ← sticky audio player
│   ├── AdminPanel.astro      ← login + upload form
│   └── Footer.astro          ← links, contact, RSS button
├── layouts/
│   └── Base.astro            ← HTML shell, meta tags, fonts
├── lib/
│   ├── supabase.ts           ← ALL Supabase calls (single source of truth)
│   └── types.ts              ← TypeScript interfaces
├── pages/
│   ├── index.astro           ← main page
│   └── feed.xml.ts           ← server-rendered RSS feed
├── scripts/
│   ├── app.ts                ← boot entry point, wires all events
│   ├── player.ts             ← audio state + controls
│   ├── grid.ts               ← episode grid rendering
│   ├── admin.ts              ← auth + upload + delete
│   ├── share.ts              ← share + deep-link + RSS download
│   ├── theme.ts              ← light/dark mode
│   └── pwa.ts                ← service worker + install prompt
└── styles/
    └── global.css            ← all CSS (variables, layout, components)
```

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env and add your Supabase URL and anon key

# 3. Start dev server
npm run dev
# → http://localhost:4321
```

---

## Deploy to Cloudflare Pages

### First time

```bash
# Build locally to check for errors
npm run build
```

Then push to GitHub — Cloudflare Pages will auto-deploy on every push to `main`.

### Cloudflare Pages settings

| Setting           | Value                          |
|-------------------|--------------------------------|
| Framework preset  | Astro                          |
| Build command     | `npm run build`                |
| Build output dir  | `dist`                         |

### Environment variables

In Cloudflare Pages → Settings → Environment Variables, add:

| Variable                  | Value                                      |
|---------------------------|--------------------------------------------|
| `PUBLIC_SUPABASE_URL`     | `https://YOUR_PROJECT_ID.supabase.co`      |
| `PUBLIC_SUPABASE_ANON_KEY`| Your Supabase publishable key              |

---

## Supabase setup

1. Create two storage buckets: `audio` and `covers` (both Public ON)
2. Run `supabase-schema.sql` in the SQL Editor
3. Create admin users in Authentication → Users

---

## Adding new features

| What you want to add       | Where to start                              |
|----------------------------|---------------------------------------------|
| New page (e.g. /programas) | `src/pages/programas.astro`                 |
| New UI component           | `src/components/MyComponent.astro`          |
| New Supabase query         | `src/lib/supabase.ts`                       |
| New client-side feature    | `src/scripts/` + wire in `app.ts`           |
| New API endpoint           | `src/pages/my-endpoint.ts`                  |
| Global styles              | `src/styles/global.css`                     |

---

## Podcast submission

Once deployed, submit `https://radiosintonizate.com/feed.xml` to:
- **Spotify** → podcasters.spotify.com
- **Apple Podcasts** → podcastsconnect.apple.com

Add a `cover.jpg` (1400×1400px square) to the `public/` folder first — podcast directories require it.
