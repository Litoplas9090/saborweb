# SaborWeb — Plataforma de pedidos para restaurantes

## 1. Visión general

Plataforma web multi-restaurante donde:
- Los **clientes finales** ven el menú, hacen pedidos y los siguen en tiempo real usando solo su **número de teléfono** (sin contraseña).
- Los **administradores de restaurante** gestionan su menú (con foto por plato), avanzan los pedidos por etapas y ven un dashboard de métricas.
- El **superusuario de plataforma** administra cualquier restaurante, menú o pedido.

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + React Router |
| Estado/datos | @supabase/supabase-js (v2) |
| Backend | Supabase: PostgreSQL, Auth (email), Realtime, Storage |
| Deploy | Render (sitio estático) + Supabase (BD/Storage) |
| Alertas sonoras | Web Audio API (sin librerías) |

No existe backend propio. Toda la lógica está en el cliente + funciones SQL en Supabase.

## 3. Roles

| Rol | Cómo accede | Permisos |
|---|---|---|
| `superadmin` | Email + contraseña (Supabase Auth) | CRUD total de restaurants, menu_items, orders de cualquier restaurante |
| `restaurant_admin` | Email + contraseña (Supabase Auth) | CRUD de menu_items de SU restaurante, avanzar estados de pedidos de SU restaurante, ver dashboard de SU restaurante |
| `customer` | Solo número de teléfono | Crear pedidos, consultar SUS pedidos por teléfono, recibir alertas de estado |

El vínculo admin↔restaurante es `profiles.restaurant_id`. El rol se guarda en `profiles.role` y se replica en `raw_user_meta_data.role` del usuario de Auth para facilitar las políticas RLS (ver schema.sql).

## 4. Flujo del pedido (etapas)

```
registrado → en_preparacion → preparado → entregado
```

- El cliente crea el pedido → estado `registrado` (se inserta automáticamente en `status_history`).
- El admin de restaurante avanza el estado con un clic desde su tablero Kanban.
- Cada cambio inserta una fila en `status_history` (auditoría + métricas).
- Cuando el estado pasa a `preparado`, el cliente recibe una **alerta sonora** en su navegador (Web Audio API) vía broadcast Realtime.
- Cuando pasa a `entregado`, el pedido sale del tablero activo del admin.

## 5. Módulos del sistema

### 5.1 Público / Cliente final
- Landing del restaurante (`/:slug`) con logo, descripción y menú organizado por categoría, con foto, descripción y precio por plato.
- Carrito (localStorage) y checkout: pide **nombre + teléfono únicamente**.
- Seguimiento: el cliente ingresa su teléfono y ve la lista de sus pedidos con su estado, en tiempo real.
- **Desbloqueo de audio**: al entrar al seguimiento se muestra el botón "Activar alertas de sonido", que ejecuta `AudioContext.resume()` (los navegadores exigen gesto del usuario antes de reproducir sonido).
- Suscripción Realtime: el cliente se une al canal `order:{order_id}` y el admin emite un broadcast cuando cambia el estado (esto evita exponer la tabla `orders` a anónimos por RLS).

### 5.2 Panel de restaurante (restaurant_admin)
- **Menú:** CRUD de platos: nombre, descripción, precio, categoría, foto (subida a Supabase Storage bucket `menu-photos`, pública), disponibilidad.
- **Tablero de pedidos (Kanban):** 4 columnas (una por etapa). Tarjetas con número de pedido, nombre y teléfono del cliente, platos y total. Botón para avanzar a la siguiente etapa. Actualización en tiempo real vía suscripción a la tabla `orders`.
- **Dashboard (pestaña Métricas):**
  - Pedidos por **día, semana y mes** (selector de rango), gráfica de barras.
  - **Top de platos más pedidos** (tendencia): cantidad vendida por plato en el rango seleccionado.
  - **Total de ventas:** `SUM(total_amount)` en el rango seleccionado.
  - Consultas con `date_trunc` (ver sección 8).

### 5.3 Panel superadmin
- CRUD de restaurantes (nombre, slug, logo, descripción, dirección, activar/desactivar).
- Acceso a los menús y pedidos de cualquier restaurante (mismas vistas del admin de restaurante, sin restricción de `restaurant_id`).

## 6. Modelo de datos (resumen)

Ver `supabase/schema.sql` para el SQL completo con RLS. Tablas:
`profiles`, `restaurants`, `menu_items`, `orders`, `order_items`, `status_history`.

Funciones clave:
- `create_order(...)` — crea el pedido + ítems, calcula el total y hace upsert del cliente por teléfono. Transaccional.
- `get_my_orders(phone)` — devuelve los pedidos de un teléfono (SECURITY DEFINER, para no abrir SELECT anónimo en `orders`).

## 7. Seguridad (RLS)

- `restaurants`, `menu_items`: SELECT público solo de lo activo; escritura solo superadmin o admin del restaurante dueño.
- `orders`, `order_items`: INSERT/SELECT/UPDATE solo admins (super o del restaurante). El cliente nunca toca estas tablas directamente: crea pedidos con `create_order` (anónimo) y consulta con `get_my_orders`.
- Storage: bucket `menu-photos` público de lectura, escritura solo admins.
- Realtime: publicación `supabase_realtime` sobre `orders` (para los paneles admin). El cliente final usa broadcast, no suscripción a tabla.

## 8. Consultas del dashboard

```sql
-- Pedidos por día en un rango
select date_trunc('day', created_at) as dia, count(*) as pedidos
from orders
where restaurant_id = :rid and created_at between :desde and :hasta
group by 1 order by 1;

-- Top platos más pedidos en un rango
select mi.name, sum(oi.quantity) as cantidad
from order_items oi
join orders o on o.id = oi.order_id
join menu_items mi on mi.id = oi.menu_item_id
where o.restaurant_id = :rid and o.created_at between :desde and :hasta
group by mi.name order by cantidad desc limit 10;

-- Total de ventas en un rango
select coalesce(sum(total_amount), 0) as total
from orders
where restaurant_id = :rid and created_at between :desde and :hasta;
```

## 9. Estructura de carpetas sugerida

```
src/
  main.jsx
  App.jsx                  # rutas
  lib/supabase.js          # cliente único de Supabase
  lib/audio.js             # alerta sonora (Web Audio API)
  components/              # UI reutilizable
  pages/
    MenuPage.jsx           # menú público del restaurante (/:slug)
    OrderTracking.jsx      # seguimiento por teléfono
    admin/
      AdminLayout.jsx
      MenuAdmin.jsx
      OrdersBoard.jsx      # Kanban de pedidos
      Dashboard.jsx
    superadmin/
      RestaurantsAdmin.jsx
```

## 10. Hitos para implementación incremental (Kimi Code)

Un hito por tarea, commit en GitHub al terminar cada uno:

1. **Hito 1 — BD:** aplicar `supabase/schema.sql` (tablas, RLS, funciones, seed). Crear bucket `menu-photos`. Crear en Supabase Auth el usuario admin y superadmin y vincularlos en `profiles`.
2. **Hito 2 — Auth:** login de admin/superadmin, rutas protegidas según rol.
3. **Hito 3 — Menú admin:** CRUD de platos con subida de fotos a Storage.
4. **Hito 4 — Experiencia cliente:** landing del restaurante, menú, carrito y checkout con teléfono.
5. **Hito 5 — Tablero de pedidos:** Kanban + avance de etapas + broadcast Realtime.
6. **Hito 6 — Seguimiento del cliente:** consulta por teléfono, estados en vivo, alerta sonora.
7. **Hito 7 — Dashboard:** métricas por día/semana/mes, top platos, suma de ventas.
8. **Hito 8 — Superadmin:** CRUD de restaurantes y acceso transversal.

## 11. Decisiones y limitaciones conscientes

- El cliente no tiene contraseña: cualquiera con el número de teléfono ve los pedidos. Es el trade-off pedido (MVP). Fase 2: OTP por SMS con Supabase Auth Phone.
- La alerta sonora solo suena con la pestaña abierta. Fase 2: PWA + Web Push para notificar con la app cerrada.
- No hay pasarela de pago en el MVP; el pedido se paga en el restaurante.
