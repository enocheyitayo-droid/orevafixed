-- Test-mode checkout with database-atomic stock reservations.
-- This migration does not enable live payments or make order tables public.
begin;

create table if not exists public.bagz_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  token text not null unique,
  reference text not null unique,
  idempotency_key text not null unique,
  request_hash text not null,
  name text not null,
  email text not null,
  phone text not null,
  address text not null default '',
  method text not null,
  delivery integer not null default 0 check(delivery>=0),
  timeframe text not null,
  instructions text not null,
  total integer not null check(total>=100),
  payment_status text not null default 'pending' check(payment_status in ('pending','paid','failed','abandoned','expired')),
  fulfilment text not null default 'Awaiting payment',
  reservation_active boolean not null default true,
  allocated boolean not null default false,
  exception text not null default '',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  transaction_id text unique,
  receipt text unique,
  checkout_url text,
  refunded integer not null default 0 check(refunded>=0)
);
create table if not exists public.bagz_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.bagz_orders(id),
  variant_id uuid references public.bagz_variants(id),
  name text not null,
  colour text not null,
  size text not null,
  quantity integer not null check(quantity between 1 and 100),
  price integer not null check(price>=100),
  cost integer not null default 0 check(cost>=0)
);
create index if not exists bagz_orders_pending_expiry on public.bagz_orders(payment_status,expires_at);
create index if not exists bagz_order_items_order on public.bagz_order_items(order_id);
alter table public.bagz_orders enable row level security;
alter table public.bagz_order_items enable row level security;
revoke all on public.bagz_orders,public.bagz_order_items from public,anon,authenticated;

create or replace function public.bagz_catalogue() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('mode','disabled','settings',
 (select jsonb_build_object('brand',value->>'brand','logo',value->>'logo','tagline',value->>'tagline','whatsapp',value->>'whatsapp','pickupInstructions',value->>'pickupInstructions','pickupTime',value->>'pickupTime','deliveryAreas',value->'deliveryAreas','bagDisplay',value->>'bagDisplay','shoeDisplay',value->>'shoeDisplay') from public.bagz_settings where id=true),
 'content','{}'::jsonb,'products',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.name,'description',p.description,'category',p.category,
 'photo',coalesce(p.photos[1],''),'photos',p.photos,'material',p.material,'care',p.care,'sample',false,
 'variants',(select jsonb_agg(jsonb_build_object('id',v.id,'colour',v.colour,'size',v.size,'price',v.price,'available',v.stock-coalesce((select sum(i.quantity) from public.bagz_order_items i join public.bagz_orders o on o.id=i.order_id where i.variant_id=v.id and o.reservation_active and o.expires_at>now()),0))) from public.bagz_variants v where v.product_id=p.id)
 ) order by p.created_at desc) from public.bagz_products p where p.visible and not p.archived and exists(select 1 from public.bagz_variants v where v.product_id=p.id)), '[]'::jsonb));
$$;
revoke all on function public.bagz_catalogue() from public;
grant execute on function public.bagz_catalogue() to anon,authenticated;

create or replace function public.bagz_create_checkout(checkout jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  settings jsonb;
  delivery_area jsonb;
  method_value text;
  delivery_value integer := 0;
  timeframe_value text;
  instructions_value text;
  address_value text := '';
  checkout_id uuid;
  checkout_token text;
  checkout_number text;
  checkout_reference text;
  line jsonb;
  variant_row record;
  quantity_value integer;
  subtotal integer := 0;
  total_value integer;
  existing public.bagz_orders;
  expired_order record;
  item_row record;
  request_hash_value text;
  idempotency_value text;
begin
  idempotency_value := nullif(trim(checkout->>'idempotency'),'');
  request_hash_value := checkout->>'request_hash';
  if idempotency_value is null or length(idempotency_value)>100 or request_hash_value is null then
    raise exception 'Invalid checkout key';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(idempotency_value,0));
  select * into existing from public.bagz_orders where idempotency_key=idempotency_value;
  if found then
    if existing.request_hash<>request_hash_value then raise exception 'Checkout key already used for different details'; end if;
    return jsonb_build_object('id',existing.id,'token',existing.token,'number',existing.number,'reference',existing.reference,'total',existing.total,'expires',floor(extract(epoch from existing.expires_at)*1000),'checkout',existing.checkout_url,'payment',existing.payment_status);
  end if;

  for expired_order in select id from public.bagz_orders where payment_status='pending' and reservation_active and expires_at<=now() order by expires_at for update loop
    for item_row in select variant_id,quantity from public.bagz_order_items where order_id=expired_order.id and variant_id is not null loop
      update public.bagz_variants set reserved=greatest(0,reserved-item_row.quantity) where id=item_row.variant_id;
    end loop;
    update public.bagz_orders set reservation_active=false,payment_status='expired',fulfilment='Expired' where id=expired_order.id;
  end loop;

  settings := (select value from public.bagz_settings where id=true);
  method_value := coalesce(checkout->>'method','pickup');
  timeframe_value := settings->>'pickupTime';
  instructions_value := settings->>'pickupInstructions';
  if method_value<>'pickup' then
    select value into delivery_area from jsonb_array_elements(coalesce(settings->'deliveryAreas','[]'::jsonb)) where value->>'id'=method_value limit 1;
    if delivery_area is null then raise exception 'Choose an available delivery area'; end if;
    delivery_value := (delivery_area->>'fee')::integer;
    timeframe_value := delivery_area->>'timeframe';
    address_value := coalesce(checkout->>'address','');
    if length(trim(address_value))=0 or length(address_value)>500 then raise exception 'Enter a valid delivery address'; end if;
    instructions_value := 'Delivery to '||address_value;
  end if;
  if jsonb_typeof(checkout->'items') is distinct from 'array' or jsonb_array_length(checkout->'items') not between 1 and 30 then raise exception 'Choose 1–30 items'; end if;

  for line in select value from jsonb_array_elements(checkout->'items') order by value->>'variant' loop
    quantity_value := (line->>'quantity')::integer;
    if quantity_value not between 1 and 100 then raise exception 'Invalid item quantity'; end if;
    select v.id,v.product_id,v.colour,v.size,v.price,v.cost,v.stock,v.reserved,p.name,p.visible,p.archived
      into variant_row
      from public.bagz_variants v join public.bagz_products p on p.id=v.product_id
      where v.id=(line->>'variant')::uuid for update of v;
    if not found or not variant_row.visible or variant_row.archived then raise exception 'This item is unavailable'; end if;
    if variant_row.stock-variant_row.reserved<quantity_value then raise exception '%: not enough stock',variant_row.name; end if;
    update public.bagz_variants set reserved=reserved+quantity_value where id=variant_row.id;
    subtotal := subtotal + variant_row.price*quantity_value;
  end loop;
  total_value := subtotal+delivery_value;
  if total_value<100 or total_value>1000000000 then raise exception 'Invalid order total'; end if;

  checkout_id := gen_random_uuid();
  checkout_token := encode(gen_random_bytes(32),'hex');
  checkout_number := 'ORE-'||to_char(now() at time zone 'UTC','YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8));
  checkout_reference := 'ore_'||encode(gen_random_bytes(20),'hex');
  insert into public.bagz_orders(id,number,token,reference,idempotency_key,request_hash,name,email,phone,address,method,delivery,timeframe,instructions,total,expires_at)
  values(checkout_id,checkout_number,checkout_token,checkout_reference,idempotency_value,request_hash_value,trim(checkout->>'name'),lower(trim(checkout->>'email')),trim(checkout->>'phone'),address_value,method_value,delivery_value,timeframe_value,instructions_value,total_value,now()+interval '30 minutes');

  for line in select value from jsonb_array_elements(checkout->'items') order by value->>'variant' loop
    quantity_value := (line->>'quantity')::integer;
    select v.id,v.colour,v.size,v.price,v.cost,p.name into variant_row
      from public.bagz_variants v join public.bagz_products p on p.id=v.product_id where v.id=(line->>'variant')::uuid;
    insert into public.bagz_order_items(order_id,variant_id,name,colour,size,quantity,price,cost)
    values(checkout_id,variant_row.id,variant_row.name,variant_row.colour,variant_row.size,quantity_value,variant_row.price,variant_row.cost);
  end loop;
  return jsonb_build_object('id',checkout_id,'token',checkout_token,'number',checkout_number,'reference',checkout_reference,'total',total_value,'expires',floor(extract(epoch from (now()+interval '30 minutes'))*1000),'payment','pending');
end $$;

create or replace function public.bagz_attach_checkout_url(order_id uuid,order_token text,checkout_url text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if checkout_url !~ '^https://checkout\.paystack\.com/' then raise exception 'Invalid Paystack checkout URL'; end if;
 update public.bagz_orders set checkout_url=bagz_attach_checkout_url.checkout_url where id=order_id and token=order_token and payment_status='pending' and expires_at>now();
 if not found then raise exception 'Checkout expired or unavailable'; end if;
end $$;

create or replace function public.bagz_release_checkout(order_id uuid,order_token text,reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare line record;
begin
 for line in select variant_id,quantity from public.bagz_order_items where bagz_order_items.order_id=bagz_release_checkout.order_id and variant_id is not null order by variant_id for update loop
   update public.bagz_variants set reserved=greatest(0,reserved-line.quantity) where id=line.variant_id;
 end loop;
 update public.bagz_orders set reservation_active=false,payment_status=case when reason='expired' then 'expired' else 'failed' end,fulfilment=case when reason='expired' then 'Expired' else 'Awaiting payment' end where id=order_id and token=order_token and payment_status='pending' and reservation_active;
end $$;

create or replace function public.bagz_confirm_payment(order_id uuid,transaction jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 o public.bagz_orders;
 line record;
 can_allocate boolean := true;
 transaction_id_value text;
 status_value text;
begin
 select * into o from public.bagz_orders where id=order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if transaction->>'reference'<>o.reference or (transaction->>'amount')::integer<>o.total or transaction->>'currency'<>'NGN' or transaction->'metadata'->>'order_id'<>o.id::text or lower(transaction->'customer'->>'email')<>o.email or transaction->>'domain'<>'test' then
   raise exception 'Payment verification details do not match order';
 end if;
 transaction_id_value := transaction->>'id';
 status_value := transaction->>'status';
 if transaction_id_value is null then raise exception 'Missing provider transaction ID'; end if;
 if o.payment_status='paid' then
   if o.transaction_id<>transaction_id_value then raise exception 'Transaction mismatch'; end if;
   return jsonb_build_object('payment','paid','fulfilment',o.fulfilment);
 end if;
 if status_value in ('failed','abandoned') then
   if o.reservation_active then
     for line in select variant_id,quantity from public.bagz_order_items where bagz_order_items.order_id=order_id and variant_id is not null order by variant_id for update loop
       update public.bagz_variants set reserved=greatest(0,reserved-line.quantity) where id=line.variant_id;
     end loop;
   end if;
   update public.bagz_orders set payment_status=status_value,reservation_active=false where id=order_id;
   return jsonb_build_object('payment',status_value,'fulfilment',o.fulfilment);
 end if;
 if status_value<>'success' then return jsonb_build_object('payment','pending','fulfilment',o.fulfilment); end if;
 if o.reservation_active and o.expires_at>now() then
   for line in select variant_id,quantity from public.bagz_order_items where bagz_order_items.order_id=order_id and variant_id is not null order by variant_id for update loop
     update public.bagz_variants set stock=stock-line.quantity,reserved=greatest(0,reserved-line.quantity) where id=line.variant_id and stock>=line.quantity;
     if not found then can_allocate:=false; end if;
   end loop;
 else
   if o.reservation_active then
     for line in select variant_id,quantity from public.bagz_order_items where bagz_order_items.order_id=order_id and variant_id is not null order by variant_id for update loop
       update public.bagz_variants set reserved=greatest(0,reserved-line.quantity) where id=line.variant_id;
     end loop;
   end if;
   for line in select i.variant_id,i.quantity,v.stock,v.reserved from public.bagz_order_items i join public.bagz_variants v on v.id=i.variant_id where i.order_id=order_id and i.variant_id is not null order by i.variant_id for update of v loop
     if line.stock-line.reserved<line.quantity then can_allocate:=false; end if;
   end loop;
   if can_allocate then
     for line in select variant_id,quantity from public.bagz_order_items where bagz_order_items.order_id=order_id and variant_id is not null order by variant_id loop
       update public.bagz_variants set stock=stock-line.quantity where id=line.variant_id;
     end loop;
   end if;
 end if;
 update public.bagz_orders set payment_status='paid',reservation_active=false,allocated=can_allocate,fulfilment=case when can_allocate then 'Paid' else 'On hold' end,exception=case when can_allocate then '' else 'Payment received after stock reservation expired. Contact the customer and reconcile.' end,transaction_id=transaction_id_value,receipt='RCT-'||number,paid_at=now() where id=order_id;
 return jsonb_build_object('payment','paid','fulfilment',case when can_allocate then 'Paid' else 'On hold' end);
end $$;

create or replace function public.bagz_public_order(order_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id',o.id,'number',o.number,'payment',o.payment_status,'fulfilment',o.fulfilment,'total',o.total,'delivery',o.delivery,'timeframe',o.timeframe,'instructions',o.instructions,'expires',floor(extract(epoch from o.expires_at)*1000),'receipt',o.receipt,'paid_at',case when o.paid_at is null then null else floor(extract(epoch from o.paid_at)*1000) end,'custom',false,'cancelled',false,'exception',o.exception,'refunded',o.refunded,'created',floor(extract(epoch from o.created_at)*1000),'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.name,'colour',i.colour,'size',i.size,'quantity',i.quantity,'price',i.price) order by i.id) from public.bagz_order_items i where i.order_id=o.id),'[]'::jsonb)) from public.bagz_orders o where o.token=order_token;
$$;

create or replace function public.bagz_order_payment_identity(order_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id',id,'reference',reference,'email',email,'checkout_url',checkout_url) from public.bagz_orders where token=order_token;
$$;

revoke all on function public.bagz_create_checkout(jsonb),public.bagz_attach_checkout_url(uuid,text,text),public.bagz_release_checkout(uuid,text,text),public.bagz_confirm_payment(uuid,jsonb),public.bagz_public_order(text),public.bagz_order_payment_identity(text) from public,anon,authenticated;
grant execute on function public.bagz_create_checkout(jsonb),public.bagz_attach_checkout_url(uuid,text,text),public.bagz_release_checkout(uuid,text,text),public.bagz_confirm_payment(uuid,jsonb),public.bagz_public_order(text),public.bagz_order_payment_identity(text) to service_role;
commit;
