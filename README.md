# 📻 Radio Sintonízate

Sitio web oficial de **Radio Sintonízate**, la radio del IES El Mayorazgo, La Orotava, Tenerife.

🌐 **Live:** [radiosintonizate.com](https://radiosintonizate.com)

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | [Astro](https://astro.build) SSR + TypeScript vanilla |
| Backend | [Supabase](https://supabase.com) (Auth, Storage, Realtime, DB) |
| Hosting | [Cloudflare Pages](https://pages.cloudflare.com) |
| Fuentes | Bebas Neue · Playfair Display · Karla (self-hosted) |
| Dominio | radiosintonizate.com |

---

## Funcionalidades

- 🎙️ Grid de episodios con tarjeta destacada (último episodio)
- ▶️ Reproductor persistente en barra inferior
- 💬 Sistema de comentarios con moderación
- 👏 Reacciones con emojis por episodio
- 🔍 Búsqueda y filtros por programa
- 🌙 Modo oscuro / claro (respeta preferencia del sistema)
- 📡 Feed RSS para podcatchers
- 📲 PWA instalable (Android / iOS)
- 🔒 Panel de administración protegido por contraseña
- ⚡ Skeleton loading + lazy load de imágenes
- 📱 Swipe-to-close en el modal de episodio

---

## Desarrollo local

### 1. Clonar el repo

```bash
git clone https://github.com/juanleonvqz/radio-sintonizate.git
cd radio-sintonizate
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Variables de entorno

Copia el archivo de ejemplo y rellena tus credenciales de Supabase:

```bash
cp .env.example .env
```

```env
PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Las encuentras en tu proyecto de Supabase → **Settings → API**.

### 4. Fuentes (primera vez)

```bash
chmod +x download-fonts.sh && ./download-fonts.sh
```

### 5. Arrancar en local

```bash
npm run dev
```

Abre [http://localhost:4321](http://localhost:4321).

---

## Supabase — configuración inicial

Ejecuta estos archivos SQL en orden desde **Supabase → SQL Editor**:

| Archivo | Qué hace |
|---------|----------|
| `supabase-schema.sql` | Tabla `episodes` + RLS |
| `supabase-site-settings.sql` | Tabla `site_settings` (descripción, banner) |
| `supabase-reactions.sql` | Tabla `reactions` (emojis por episodio) |
| `supabase-comments.sql` | Tabla `comments` con moderación |

### Buckets de Storage

Crea dos buckets en **Supabase → Storage**, ambos **públicos**:

- `audio` — archivos de audio (MP3)
- `covers` — portadas de episodios (WebP)

### RLS extra para el panel de administración

Para que el admin pueda ver comentarios pendientes, ejecuta también:

```sql
create policy "comments: auth read all"
  on public.comments for select
  using (auth.role() = 'authenticated');
```

### Usuario administrador

En **Supabase → Authentication → Users**, crea un usuario con email y contraseña. Esas mismas credenciales son las que usarás en el panel de admin del sitio.

---

## Despliegue en Cloudflare Pages

### Configuración del proyecto

| Campo | Valor |
|-------|-------|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `18` |

### Variables de entorno en Cloudflare

En **Pages → Settings → Environment variables**, añade:

```
PUBLIC_SUPABASE_URL      → tu URL de Supabase
PUBLIC_SUPABASE_ANON_KEY → tu anon key de Supabase
```

### Dominio personalizado

En **Pages → Custom domains**, añade `radiosintonizate.com` y sigue las instrucciones para apuntar los DNS.

---

## Panel de administración

Accede desde el botón **Admin** en el pie de página.

| Pestaña | Función |
|---------|---------|
| **Episodios** | Ver, editar y eliminar episodios existentes |
| **Nuevo** | Subir audio + portada, título, descripción, programa y fecha |
| **Comentarios** | Aprobar o rechazar comentarios pendientes |
| **Ajustes** | Editar descripción del sitio y mostrar/ocultar el banner |

Las portadas se redimensionan automáticamente a 900px y se convierten a WebP al subir.

---

## Feed RSS / Podcasts

El feed está disponible en:

```
https://radiosintonizate.com/feed.xml
```

### Enviar a Spotify y Apple Podcasts

1. Crea una imagen cuadrada de **1400×1400px** y guárdala en `public/cover.jpg`
2. Envía el feed a [Spotify for Podcasters](https://podcasters.spotify.com) y a [Apple Podcasts Connect](https://podcastsconnect.apple.com)

---

## Estructura del proyecto

```
src/
├── components/
│   ├── Header.astro            # Cabecera + banner PWA
│   ├── Footer.astro            # Pie de página + toggle de tema
│   ├── Player.astro            # Barra de reproductor inferior
│   ├── DescriptionBanner.astro
│   └── AdminPanel.astro        # Panel de administración (4 pestañas)
├── layouts/
│   └── Base.astro              # HTML base, SEO, OG, preloads
├── lib/
│   ├── supabase.ts             # Todas las llamadas a Supabase
│   └── types.ts                # Interfaz Episode
├── pages/
│   ├── index.astro             # Página principal
│   ├── feed.xml.ts             # Feed RSS
│   └── api/episodes.ts         # API endpoint de episodios
├── scripts/
│   ├── app.ts                  # Punto de entrada, inicialización
│   ├── grid.ts                 # Grid de episodios + modal
│   ├── player.ts               # Lógica del reproductor
│   ├── admin.ts                # Panel de administración
│   ├── theme.ts                # Modo oscuro/claro
│   ├── share.ts                # Compartir episodios
│   └── pwa.ts                  # Manifest + service worker
└── styles/
    ├── global.css              # Todos los estilos
    └── fonts.css               # Fuentes self-hosted
```

---

## Costes estimados

| Servicio | Coste |
|----------|-------|
| Cloudflare Pages | Gratis |
| Supabase (free tier) | Gratis hasta ~18 episodios largos en storage |
| Supabase Pro (si se necesita) | ~25 $/mes |
| Dominio | ~10–15 $/año |

El tier gratuito de Supabase incluye 1 GB de storage. Un episodio de 30 minutos en MP3 a 128 kbps ocupa ~55 MB, así que el límite se alcanza en torno a los 18 episodios. Con el plan Pro el límite sube a 100 GB.

---

## TODOs pendientes

- [ ] Subir imagen cuadrada `public/cover.jpg` (1400×1400px) y enviar feed a Spotify y Apple Podcasts
- [ ] Verificar sitio en [Google Search Console](https://search.google.com/search-console)
- [ ] Contador de escuchas por episodio
- [ ] Toggle publicar/despublicar episodio sin eliminar
- [ ] Render SSR de la lista de episodios (mejora SEO)

---

## Licencia

Uso interno — IES El Mayorazgo, La Orotava, Tenerife.