-- Final fulfilment model: free ACU pickup or flat-rate Nigeria delivery (₦4,000).

create or replace function public.bagz_create_checkout(checkout jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  settings jsonb;
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
  if method_value='delivery' then
    delivery_value := 400000;
    timeframe_value := 'Standard delivery anywhere in Nigeria';
    address_value := coalesce(checkout->>'address','');
    if length(trim(address_value))=0 or length(address_value)>500 then raise exception 'Enter a valid delivery address'; end if;
    instructions_value := 'Delivery to '||address_value;
  elsif method_value<>'pickup' then
    raise exception 'Choose delivery or ACU pickup';
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


revoke all on function public.bagz_create_checkout(jsonb) from public,anon,authenticated;
grant execute on function public.bagz_create_checkout(jsonb) to service_role;
