create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 email text,
 created_at timestamptz not null default now()
);
create table private.admin_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_at timestamptz not null default now()
);
create function private.is_admin() returns boolean
 language sql stable security definer set search_path = ''
 as $$ select exists(select 1 from private.admin_users where user_id = (select auth.uid())) $$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create function private.create_profile() returns trigger
 language plpgsql security definer set search_path = ''
 as $$
 begin
  insert into public.profiles(id,display_name,email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name',''), new.email)
  on conflict(id) do nothing;
  return new;
 end; $$;
create trigger on_tabo_user_created after insert on auth.users
 for each row execute function private.create_profile();
insert into public.profiles(id, display_name, email)
select id, coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',''), email
from auth.users on conflict (id) do nothing;

create table public.shops (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null unique references auth.users(id) on delete restrict,
 name text not null check (char_length(name) between 2 and 100),
 description text not null default '',
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 is_open boolean not null default false,
 offers_pickup boolean not null default true,
 offers_delivery boolean not null default false,
 delivery_fee_cents integer not null default 0 check (delivery_fee_cents between 0 and 1000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (offers_pickup or offers_delivery)
);
create table public.menu_items (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 120),
 description text not null default '',
 image_url text,
 price_cents integer not null check (price_cents between 1 and 100000000),
 is_available boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index idx_menu_items_shop on public.menu_items(shop_id);
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references auth.users(id) on delete restrict,
 shop_id uuid not null references public.shops(id) on delete restrict,
 request_id uuid not null,
 method text not null check (method in ('pickup','delivery')),
 status text not null default 'placed' check (status in ('placed','accepted','preparing','ready_for_pickup','out_for_delivery','completed','rejected','cancelled')),
 phone text not null check (char_length(phone) between 7 and 30),
 delivery_address text,
 note text not null default '' check (char_length(note) <= 500),
 subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
 delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),
 total_cents bigint not null default 0 check (total_cents >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (buyer_id, request_id),
 check (method = 'pickup' or (delivery_address is not null and char_length(delivery_address) >= 8))
);
create index idx_orders_buyer_created on public.orders(buyer_id, created_at desc);
create index idx_orders_shop_created on public.orders(shop_id, created_at desc);
create table public.order_items (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders(id) on delete cascade,
 menu_item_id uuid not null references public.menu_items(id) on delete restrict,
 item_name text not null,
 quantity integer not null check (quantity between 1 and 25),
 unit_price_cents integer not null check (unit_price_cents > 0),
 line_total_cents bigint not null check (line_total_cents >= 0)
);
create index idx_order_items_order on public.order_items(order_id);

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table private.admin_users enable row level security;

create policy profile_own_select on public.profiles for select to authenticated
 using (id = (select auth.uid()) or (select private.is_admin()));
create policy profile_own_update on public.profiles for update to authenticated
 using (id = (select auth.uid()))
 with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;

create policy shops_browse on public.shops for select to anon, authenticated
 using (status = 'approved' or owner_id = (select auth.uid()) or (select private.is_admin()));
create policy shops_apply on public.shops for insert to authenticated
 with check (owner_id = (select auth.uid()) and status = 'pending' and is_open = false);
grant select on public.shops to anon, authenticated;
grant insert(id,owner_id,name,description,offers_pickup,offers_delivery,delivery_fee_cents) on public.shops to authenticated;

create policy menu_browse on public.menu_items for select to anon, authenticated
 using (exists (
  select 1 from public.shops s where s.id = shop_id and
   (s.status = 'approved' or s.owner_id = (select auth.uid()) or (select private.is_admin()))
 ));
create policy menu_seller_insert on public.menu_items for insert to authenticated
 with check (exists(select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
create policy menu_seller_update on public.menu_items for update to authenticated
 using (exists(select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())))
 with check (exists(select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
create policy menu_seller_delete on public.menu_items for delete to authenticated
 using (exists(select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
grant select on public.menu_items to anon, authenticated;
grant insert(shop_id,name,description,image_url,price_cents,is_available) on public.menu_items to authenticated;
grant update(name,description,image_url,price_cents,is_available) on public.menu_items to authenticated;
grant delete on public.menu_items to authenticated;

create policy orders_visible on public.orders for select to authenticated
 using (buyer_id = (select auth.uid()) or
  exists(select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid()))
  or (select private.is_admin()));
create policy order_items_visible on public.order_items for select to authenticated
 using (exists(select 1 from public.orders o where o.id = order_id and
  (o.buyer_id = (select auth.uid()) or
   exists(select 1 from public.shops s where s.id = o.shop_id and s.owner_id = (select auth.uid()))
   or (select private.is_admin()))));
grant select on public.orders, public.order_items to authenticated;

create function public.update_shop_settings(
 p_shop_id uuid, p_name text, p_description text,
 p_is_open boolean, p_pickup boolean, p_delivery boolean, p_delivery_fee_cents integer
) returns void language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
 if not (p_pickup or p_delivery) then raise exception 'A fulfillment method is required'; end if;
 if p_delivery_fee_cents < 0 or p_delivery_fee_cents > 1000000 then raise exception 'Invalid delivery fee'; end if;
 update public.shops set name=p_name, description=coalesce(p_description,''),
  is_open=p_is_open, offers_pickup=p_pickup, offers_delivery=p_delivery,
  delivery_fee_cents=p_delivery_fee_cents, updated_at=now()
 where id=p_shop_id and owner_id=(select auth.uid());
 if not found then raise exception 'Not your shop'; end if;
end; $$;

create function public.review_shop(p_shop_id uuid, p_status text)
 returns void language plpgsql security definer set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'Admin access required'; end if;
 if p_status not in ('approved','rejected') then raise exception 'Invalid review decision'; end if;
 update public.shops set status=p_status, is_open=case when p_status='rejected' then false else is_open end,
  updated_at=now() where id=p_shop_id;
 if not found then raise exception 'Shop not found'; end if;
end; $$;

create function public.place_order(
 p_shop_id uuid, p_method text, p_items jsonb, p_phone text,
 p_delivery_address text, p_note text, p_request_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 v_buyer uuid := (select auth.uid());
 v_shop public.shops%rowtype;
 v_order uuid;
 v_line jsonb;
 v_menu public.menu_items%rowtype;
 v_qty integer;
 v_subtotal bigint := 0;
 v_delivery bigint := 0;
 v_seen uuid[] := '{}'::uuid[];
 v_item_id uuid;
begin
 if v_buyer is null then raise exception 'Google sign in required'; end if;
 if p_request_id is null then raise exception 'Request ID required'; end if;
 if p_method not in ('pickup','delivery') then raise exception 'Invalid fulfillment method'; end if;
 if p_phone is null or char_length(trim(p_phone)) not between 7 and 30 then raise exception 'Valid contact phone required'; end if;
 if p_note is not null and char_length(p_note) > 500 then raise exception 'Order note is too long'; end if;
 if p_method='delivery' and (p_delivery_address is null or char_length(trim(p_delivery_address)) < 8) then
  raise exception 'Delivery address required';
 end if;
 if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 25 then
  raise exception 'Choose 1 to 25 distinct menu items';
 end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_buyer::text || p_request_id::text,0));
 select id into v_order from public.orders where buyer_id=v_buyer and request_id=p_request_id;
 if found then return v_order; end if;

 select * into v_shop from public.shops where id=p_shop_id and status='approved' and is_open=true;
 if not found then raise exception 'Shop is not accepting orders'; end if;
 if (p_method='pickup' and not v_shop.offers_pickup) or
    (p_method='delivery' and not v_shop.offers_delivery) then
  raise exception 'Fulfillment method not offered by shop';
 end if;
 v_delivery := case when p_method='delivery' then v_shop.delivery_fee_cents else 0 end;

 insert into public.orders(buyer_id,shop_id,request_id,method,phone,delivery_address,note,delivery_fee_cents)
 values(v_buyer,p_shop_id,p_request_id,p_method,trim(p_phone),
  case when p_method='delivery' then trim(p_delivery_address) else null end,
  coalesce(p_note,''),v_delivery) returning id into v_order;

 for v_line in select value from pg_catalog.jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_line) <> 'object' then raise exception 'Invalid menu item'; end if;
  v_item_id := (v_line->>'id')::uuid;
  v_qty := (v_line->>'quantity')::integer;
  if v_qty is null or v_qty not between 1 and 25 then raise exception 'Invalid quantity'; end if;
  if v_item_id = any(v_seen) then raise exception 'Duplicate menu item'; end if;
  v_seen := pg_catalog.array_append(v_seen,v_item_id);
  select * into v_menu from public.menu_items
   where id=v_item_id and shop_id=p_shop_id and is_available=true;
  if not found then raise exception 'An item is unavailable'; end if;
  insert into public.order_items(order_id,menu_item_id,item_name,quantity,unit_price_cents,line_total_cents)
  values(v_order,v_item_id,v_menu.name,v_qty,v_menu.price_cents,v_menu.price_cents::bigint*v_qty);
  v_subtotal := v_subtotal + v_menu.price_cents::bigint*v_qty;
 end loop;
 update public.orders set subtotal_cents=v_subtotal, total_cents=v_subtotal+v_delivery where id=v_order;
 return v_order;
end; $$;

create function public.change_order_status(p_order_id uuid, p_status text)
 returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_owner uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 select owner_id into v_owner from public.shops where id=v_order.shop_id;
 if v_owner is distinct from (select auth.uid()) then raise exception 'Not the seller'; end if;
 if not (
 (v_order.status='placed' and p_status in ('accepted','rejected')) or
 (v_order.status='accepted' and p_status='preparing') or
 (v_order.status='preparing' and
  ((v_order.method='pickup' and p_status='ready_for_pickup') or
   (v_order.method='delivery' and p_status='out_for_delivery'))) or
 (v_order.status in ('ready_for_pickup','out_for_delivery') and p_status='completed')
 ) then raise exception 'Invalid order transition'; end if;
 update public.orders set status=p_status,updated_at=now() where id=p_order_id;
end; $$;

revoke all on function public.update_shop_settings(uuid,text,text,boolean,boolean,boolean,integer) from public;
revoke all on function public.review_shop(uuid,text) from public;
revoke all on function public.place_order(uuid,text,jsonb,text,text,text,uuid) from public;
revoke all on function public.change_order_status(uuid,text) from public;
grant execute on function public.update_shop_settings(uuid,text,text,boolean,boolean,boolean,integer) to authenticated;
grant execute on function public.review_shop(uuid,text) to authenticated;
grant execute on function public.place_order(uuid,text,jsonb,text,text,text,uuid) to authenticated;
grant execute on function public.change_order_status(uuid,text) to authenticated;
