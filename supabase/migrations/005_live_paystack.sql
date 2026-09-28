-- Allow server-verified Paystack test or live transactions.
-- The server still enforces that the transaction domain matches the configured secret-key mode.
begin;

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
 if transaction->>'reference'<>o.reference or (transaction->>'amount')::integer<>o.total or transaction->>'currency'<>'NGN' or transaction->'metadata'->>'order_id'<>o.id::text or lower(transaction->'customer'->>'email')<>o.email or transaction->>'domain' not in ('test','live') then
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


commit;
