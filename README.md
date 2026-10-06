# 📻 Radio Sintonízate

Sitio web oficial de **Radio Sintonízate**, la radio del IES El Mayorazgo, La Orotava, Tenerife.

🌐 **Live:** [radiosintonizate.com](https://radiosintonizate.com)

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | [Astro](https://astro.build) SSR + TypeScript vanilla |
| Backend | Endpoints propios en Cloudflare Pages Functions: base de datos [D1](https://developers.cloudflare.com/d1/), archivos en [R2](https://developers.cloudflare.com/r2/), inicio de sesión propio |
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

### 3. Base de datos y archivos locales

No hace falta ningún archivo `.env`. La base de datos y el bucket de archivos locales los crea
`wrangler` (viene con las dependencias) a partir de `wrangler.toml`:

```bash
npx wrangler d1 migrations apply radio-sintonizate --local
```

Para tener episodios en local, carga una exportación (ver más abajo) o crea una cuenta de
administración e inserta episodios desde el panel.

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

## Cloudflare: base de datos, archivos y cuentas

El sitio se sirve desde el proyecto de Cloudflare Pages `radio-sintonizate`, que despliega la rama
`main`. Los datos viven en Cloudflare, bajo jurisdicción de la UE:

| Recurso | Nombre | Contenido |
|---------|--------|-----------|
| D1 | `radio-sintonizate` | episodios, comentarios, reacciones, ajustes, cuentas de administración, sesiones |
| R2 | `radio-sintonizate-media` | audio (`audio/…`) y portadas (`covers/…`) |

Ambos están enlazados al proyecto de Pages como `DB` y `MEDIA` (Settings → Bindings). El esquema
está en `migrations/` y se aplica con:

```bash
npx wrangler d1 migrations apply radio-sintonizate --remote
```

### Permisos

Las reglas viven en el código del servidor (`src/server/auth/gate.ts` y los endpoints de
`src/pages/api/`), con una prueba por cada regla en `src/server/api-rules.test.ts`:

- Cualquiera lee episodios, comentarios aprobados, reacciones y ajustes; deja comentarios (quedan
  pendientes) y añade reacciones.
- Solo una cuenta de administración con sesión iniciada publica, edita o borra episodios, sube
  archivos, revisa comentarios y cambia los ajustes.
- No existe el registro de usuarios: una cuenta de administración es una fila en la tabla `users`.

### Cuentas de administración

Las cuentas se traspasaron desde el antiguo Supabase con su contraseña tal cual. No hay pantalla de
registro ni de "olvidé mi contraseña" a propósito: una cuenta es una fila en la tabla `users`.

Para cambiar la contraseña de una cuenta (por ejemplo si se olvida), desde el servidor de desarrollo:

```bash
node scripts/set-password.mjs correo@ejemplo.com
```

Pide la contraseña dos veces sin mostrarla, la guarda y cierra la sesión de esa cuenta en todos los
dispositivos. Necesita las credenciales de Cloudflare en el entorno; en el servidor el atajo
`radio-password <correo>` las carga solo. Para añadir una cuenta nueva hace falta insertar antes la
fila en `users` (id, email) y luego usar el mismo script.

### Copia diaria y restauración

Cada noche, un temporizador del servidor de desarrollo (`radio-copy.timer`) ejecuta
`scripts/pull-live.mjs`, que copia las filas, las cuentas y los archivos nuevos del sitio en vivo a
`~/inbox/radio-sintonizate/live/`, carpeta que entra en la copia de seguridad cifrada de esa misma
noche. Un archivo borrado del bucket se conserva en la copia a propósito.

Esa copia (o la última exportación de Supabase, de octubre de 2026, guardada en el mismo sitio)
se carga de nuevo en D1 y R2 con dos scripts; sustituyen lo que hubiera:

```bash
npm run d1:import-sql -- <carpeta-export> /tmp/radio.sql && npx wrangler d1 execute radio-sintonizate --remote --file /tmp/radio.sql
npm run r2:upload -- <carpeta-export>
```

---

## Despliegue en Cloudflare Pages

| Campo | Valor |
|-------|-------|
| Build command | `npm run build` |
| Output directory | `dist` |
| Bindings | D1 `DB` → `radio-sintonizate`, R2 `MEDIA` → `radio-sintonizate-media` (jurisdicción `eu`) |

No hacen falta variables de entorno. Cada rama tiene su *preview* en `<rama>.radio-sintonizate.pages.dev`.

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
│   ├── api.ts                  # Todas las llamadas al servidor (/api y /media)
│   ├── html.ts                 # Escape de texto antes de insertarlo en el DOM
│   └── types.ts                # Interfaz Episode
├── pages/
│   ├── index.astro             # Página principal
│   ├── feed.xml.ts             # Feed RSS (desde D1)
│   ├── api/                    # Endpoints: auth, episodios, comentarios, ajustes, subidas
│   └── media/                  # Audio y portadas servidos desde R2
├── server/                     # Lógica del servidor y sus pruebas (vitest)
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
| Cloudflare Pages, D1 y R2 | Gratis con el uso actual (10 GB de archivos, sin coste por descargas) |
| Dominio | ~10–15 $/año |

---

## TODOs pendientes

- [ ] Subir imagen cuadrada `public/cover.jpg` (1400×1400px) y enviar feed a Spotify y Apple Podcasts
- [ ] Verificar sitio en [Google Search Console](https://search.google.com/search-console)
- [ ] Contador de escuchas por episodio
- [ ] Toggle publicar/despublicar episodio sin eliminar
- [ ] Render SSR de la lista de episodios (mejora SEO)
- [ ] Pruebas en navegador real; hoy las de `src/server/` cubren el servidor y el recorrido de la página se hace con jsdom

---

## Licencia

Uso interno — IES El Mayorazgo, La Orotava, Tenerife.