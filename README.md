# SaborWeb — Plataforma de pedidos para restaurantes

Plataforma web multi-restaurante donde los clientes finales ven el menú, hacen
pedidos y los siguen en tiempo real usando solo su número de teléfono (sin
contraseña); los administradores de restaurante gestionan su menú, avanzan los
pedidos por etapas en un tablero Kanban y consultan métricas; y el superusuario
de plataforma administra cualquier restaurante, menú o pedido.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 + Tailwind CSS 3 + React Router 7 |
| Estado/datos | @supabase/supabase-js v2 |
| Backend | Supabase: PostgreSQL, Auth (email), Realtime, Storage |
| Deploy | Render (sitio estático) + Supabase (BD/Storage) |
| Alertas sonoras | Web Audio API (sin librerías) |

No existe backend propio: toda la lógica está en el cliente + funciones SQL en
Supabase (ver `schema.sql` y `SPEC.md`).

## Variables de entorno

La aplicación **no arranca sin estas variables**. Copia `.env.example` como
`.env` y rellénalas con los datos de tu proyecto de Supabase
(Project Settings → API):

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (ej: `https://tu-proyecto.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (anon/public) del proyecto |

> Nunca subas el `.env` real al repositorio ni uses la `service_role` key en el
> frontend; la anon key es segura gracias a las políticas RLS.

## Cómo correr en desarrollo

```bash
npm install        # solo la primera vez
npm run dev        # servidor de desarrollo en http://localhost:5173
```

## Cómo hacer el build

```bash
npm run build      # genera el sitio estático en dist/
npm run preview    # sirve dist/ localmente para verificar el build
```

## Deploy en Render (Static Site)

1. Crea un **Static Site** nuevo en Render conectado al repositorio.
2. Configura el servicio:
   - **Build Command:** `npm install && npm run build` (o `npm run build` si
     Render ya instala dependencias automáticamente).
   - **Publish Directory:** `dist`
3. Agrega las variables de entorno en **Environment** (sección *Environment
   Variables* del servicio):
   - `VITE_SUPABASE_URL` = la URL de tu proyecto Supabase.
   - `VITE_SUPABASE_ANON_KEY` = la anon key de tu proyecto.
   
   Estas variables deben existir **en build time**, porque Vite las inyecta en
   el bundle estático.
4. Guarda y despliega. Render ejecutará el build y publicará `dist/`.

### Nota sobre el enrutado del lado del cliente

La app usa React Router (BrowserRouter) con rutas como `/:slug`, `/login`,
`/admin/pedidos`, etc. Configura en Render un **rewrite/redirect** de SPA:
todas las rutas deben servir `index.html` (en Static Sites de Render se hace
con un archivo `public/_redirects` o `render.yaml` con la regla
`/* → /index.html` con status 200), de lo contrario las recargas de rutas
profundas devolverán 404.

## Estructura del código

```
src/
  main.jsx / App.jsx       # arranque y rutas
  index.css                # Tailwind
  context/AuthContext.jsx  # sesión + perfil (rol, restaurante)
  lib/                     # cliente Supabase, audio, formato
  components/
    RootLayout.jsx / RequireRole.jsx
    ui/                    # componentes UI compartidos (Button, Input, Card…)
  pages/
    MenuPage.jsx           # menú público del restaurante (/:slug)
    OrderTracking.jsx      # seguimiento por teléfono
    Login.jsx / AccessDenied.jsx
    admin/                 # panel de restaurante (menú, pedidos, dashboard)
    superadmin/            # CRUD de restaurantes
```
