-- ============================================================
-- SaborWeb — Esquema inicial de Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ---------- Tipos ----------
create type public.user_role as enum ('superadmin', 'restaurant_admin', 'customer');
create type public.order_status as enum ('registrado', 'en_preparacion', 'preparado', 'entregado', 'pagado');

-- ---------- Tablas ----------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  description text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null unique, -- null para clientes de teléfono
  phone text unique,
  full_name text,
  role public.user_role not null default 'customer',
  restaurant_id uuid references public.restaurants(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  photo_url text,
  category text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_phone text, -- opcional: el seguimiento se hace por número de pedido
  customer_name text not null,
  total_amount numeric(10,2) not null default 0,
  status public.order_status not null default 'registrado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null
);

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  changed_at timestamptz not null default now()
);

create index on public.menu_items (restaurant_id);
create index on public.orders (restaurant_id, created_at desc);
create index on public.orders (customer_phone);
create index on public.orders (left(replace(id::text, '-', ''), 8)); -- búsqueda por número corto
create index on public.order_items (order_id);
create index on public.status_history (order_id);

-- ---------- Helpers de RLS ----------
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'superadmin'
  );
$$;

create or replace function public.my_restaurant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select restaurant_id from public.profiles
  where user_id = auth.uid() and role = 'restaurant_admin'
  limit 1;
$$;

create or replace function public.has_restaurant_access(p_restaurant_id uuid)
returns boolean language sql stable as $$
  select public.is_superadmin() or public.my_restaurant_id() = p_restaurant_id;
$$;

-- ---------- Triggers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger trg_orders_updated
  before update on public.orders
  for each row execute function public.set_updated_at();

create or replace function public.log_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') or (old.status is distinct from new.status) then
    insert into public.status_history (order_id, status) values (new.id, new.status);
  end if;
  return new;
end; $$;

create trigger trg_orders_status_history
  after insert or update of status on public.orders
  for each row execute function public.log_status_change();

-- ---------- RLS ----------
alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.status_history enable row level security;

-- restaurants
create policy "restaurants_select_public" on public.restaurants
  for select using (is_active or public.is_superadmin() or public.my_restaurant_id() = id);
create policy "restaurants_insert_super" on public.restaurants
  for insert with check (public.is_superadmin());
create policy "restaurants_update_super_or_owner" on public.restaurants
  for update using (public.is_superadmin() or public.my_restaurant_id() = id);
create policy "restaurants_delete_super" on public.restaurants
  for delete using (public.is_superadmin());

-- profiles
create policy "profiles_select_own" on public.profiles
  for select using (
    user_id = auth.uid()
    or public.is_superadmin()
    or (role = 'restaurant_admin' and restaurant_id = public.my_restaurant_id())
  );
create policy "profiles_update_super" on public.profiles
  for update using (public.is_superadmin());

-- menu_items
create policy "menu_select_public" on public.menu_items
  for select using (
    (is_available and exists (
      select 1 from public.restaurants r where r.id = restaurant_id and r.is_active
    ))
    or public.has_restaurant_access(restaurant_id)
  );
create policy "menu_insert_admin" on public.menu_items
  for insert with check (public.has_restaurant_access(restaurant_id));
create policy "menu_update_admin" on public.menu_items
  for update using (public.has_restaurant_access(restaurant_id));
create policy "menu_delete_admin" on public.menu_items
  for delete using (public.has_restaurant_access(restaurant_id));

-- orders
create policy "orders_select_admin" on public.orders
  for select using (public.has_restaurant_access(restaurant_id));
create policy "orders_update_admin" on public.orders
  for update using (public.has_restaurant_access(restaurant_id));
create policy "orders_delete_super" on public.orders
  for delete using (public.is_superadmin());

-- order_items
create policy "order_items_select_admin" on public.order_items
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_id and public.has_restaurant_access(o.restaurant_id)
  ));
create policy "order_items_insert_admin" on public.order_items
  for insert with check (exists (
    select 1 from public.orders o
    where o.id = order_id and public.has_restaurant_access(o.restaurant_id)
  ));

-- status_history
create policy "status_history_select_admin" on public.status_history
  for select using (exists (
    select 1 from public.orders o
    where o.id = order_id and public.has_restaurant_access(o.restaurant_id)
  ));

-- ---------- Funciones para el cliente final (anónimo) ----------
-- El cliente se identifica solo por su nombre; el seguimiento del pedido se
-- hace con el número corto (primeros 8 hex del UUID, ver shortOrderId).
create or replace function public.create_order(
  p_restaurant_id uuid,
  p_customer_name text,
  p_items jsonb  -- [{"menu_item_id": "uuid", "quantity": 2}, ...]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_price numeric(10,2);
begin
  -- validar restaurante y calcular total
  if not exists (select 1 from public.restaurants where id = p_restaurant_id and is_active) then
    raise exception 'Restaurante no disponible';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select price into v_price from public.menu_items
     where id = (v_item->>'menu_item_id')::uuid
       and restaurant_id = p_restaurant_id
       and is_available;
    if v_price is null then
      raise exception 'Plato inválido o no disponible: %', v_item->>'menu_item_id';
    end if;
    v_total := v_total + v_price * (v_item->>'quantity')::int;
  end loop;

  insert into public.orders (restaurant_id, customer_name, total_amount)
  values (p_restaurant_id, p_customer_name, v_total)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select price into v_price from public.menu_items where id = (v_item->>'menu_item_id')::uuid;
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
    values (v_order_id, (v_item->>'menu_item_id')::uuid, (v_item->>'quantity')::int, v_price);
  end loop;

  return v_order_id;
end; $$;

-- Consulta del pedido por su número corto (los 8 hex visibles en la app,
-- con o sin '#'). SECURITY DEFINER para no abrir SELECT anónimo en orders.
create or replace function public.get_order_by_short(p_short_id text)
returns setof public.orders
language sql stable security definer set search_path = public as $$
  select * from public.orders
  where left(replace(id::text, '-', ''), 8) = upper(trim(both '# ' from p_short_id))
  order by created_at desc
  limit 1;
$$;

create or replace function public.get_order_items(p_order_id uuid)
returns table (menu_item_id uuid, name text, quantity integer, unit_price numeric(10,2))
language sql stable security definer set search_path = public as $$
  select oi.menu_item_id, mi.name, oi.quantity, oi.unit_price
  from public.order_items oi
  join public.menu_items mi on mi.id = oi.menu_item_id
  where oi.order_id = p_order_id;
$$;

-- ---------- Realtime (paneles admin) ----------
alter publication supabase_realtime add table public.orders;

-- ---------- Seed ----------
insert into public.restaurants (name, slug, description, address)
values ('Sabor Criollo', 'sabor-criollo',
        'Comida criolla auténtica, hecha al momento.',
        'Av. Principal 123, Lima')
returning id; -- guardar el id generado

-- Sustituir :RESTAURANT_ID por el id retornado arriba
insert into public.menu_items (restaurant_id, name, description, price, category) values
  ('00000000-0000-0000-0000-000000000000', 'Ají de gallina', 'Pollo deshilachado en crema de ají amarillo con nueces, arroz y papa', 18.90, 'Platos principales'),
  ('00000000-0000-0000-0000-000000000000', 'Lomo saltado', 'Trozos de lomo fino salteados con cebolla, tomate y papas fritas', 24.50, 'Platos principales'),
  ('00000000-0000-0000-0000-000000000000', 'Ceviche mixto', 'Pescado y mariscos en leche de tigre con choclo y camote', 28.00, 'Mariscos'),
  ('00000000-0000-0000-0000-000000000000', 'Papa a la huancaína', 'Papas cocidas en salsa de ají amarillo y queso', 10.00, 'Entradas'),
  ('00000000-0000-0000-0000-000000000000', 'Chicha morada', 'Bebida de maíz morado con piña y canela', 6.50, 'Bebidas'),
  ('00000000-0000-0000-0000-000000000000', 'Suspiro a la limeña', 'Postre de manjar blanco con merengue', 9.90, 'Postres');

-- ============================================================
-- PASOS MANUALES DESPUÉS DE EJECUTAR:
-- 1. Storage → crear bucket público "menu-photos".
-- 2. Authentication → crear usuarios (email/clave) para superadmin
--    y para el admin del restaurante.
-- 3. Ejecutar por cada usuario admin (sustituir valores):
--      insert into public.profiles (user_id, full_name, role, restaurant_id)
--      values ('<auth.users.id>', 'Ana Admin', 'restaurant_admin', '<restaurant_id>');
--    Para el superadmin: role = 'superadmin', restaurant_id = null.
-- ============================================================
