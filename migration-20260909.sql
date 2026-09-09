-- ============================================================
-- SaborWeb — Migración: etapa "pagado", pedido consultable por
-- número corto y checkout solo con nombre.
-- Ejecutar en: Supabase Dashboard → SQL Editor (una sola vez)
-- ============================================================

-- 1. Nueva etapa final "pagado" (después de "entregado")
alter type public.order_status add value 'pagado';

-- 2. Teléfono del cliente opcional (ya no es la llave de consulta)
alter table public.orders alter column customer_phone drop not null;

-- 3. create_order: solo nombre (firma nueva, se borra la anterior)
drop function if exists public.create_order(uuid, text, text, jsonb);
create or replace function public.create_order(
  p_restaurant_id uuid,
  p_customer_name text,
  p_items jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_price numeric(10,2);
begin
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

-- 4. Consulta por número corto de pedido (reemplaza get_my_orders por teléfono)
drop function if exists public.get_my_orders(text);
create or replace function public.get_order_by_short(p_short_id text)
returns setof public.orders
language sql stable security definer set search_path = public as $$
  select * from public.orders
  where lower(left(replace(id::text, '-', ''), 8)) = lower(trim(both '# ' from p_short_id))
  order by created_at desc
  limit 1;
$$;

create index if not exists orders_short_id_idx
  on public.orders (left(replace(id::text, '-', ''), 8));
