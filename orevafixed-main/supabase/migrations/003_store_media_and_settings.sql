-- Public bucket holds only sanitized, published storefront images.
-- The existing bagz-photos bucket remains private.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bagz-store-media','bagz-store-media',true,5242880,array['image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/webp'];

drop policy if exists bagz_store_media_owner_insert on storage.objects;
drop policy if exists bagz_store_media_owner_delete on storage.objects;
create policy bagz_store_media_owner_insert on storage.objects
for insert to authenticated with check(bucket_id='bagz-store-media' and public.bagz_is_owner());
create policy bagz_store_media_owner_delete on storage.objects
for delete to authenticated using(bucket_id='bagz-store-media' and public.bagz_is_owner());

create or replace function public.bagz_storefront_gallery() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(value->'displayGallery','[]'::jsonb)
 from public.bagz_settings where id=true;
$$;
revoke all on function public.bagz_storefront_gallery() from public;
grant execute on function public.bagz_storefront_gallery() to anon,authenticated;

create or replace function public.bagz_save_product(item jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid; vid uuid; v jsonb; seen uuid[]='{}'; oldrow public.bagz_variants; paths text[]; image_path text;
begin
 if not public.bagz_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 pid=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
 perform pg_advisory_xact_lock(hashtextextended(pid::text,0));
 if exists(select 1 from public.bagz_products where id=pid and archived) then raise exception 'Product was deleted'; end if;
 if jsonb_typeof(item->'variants') is distinct from 'array' or jsonb_array_length(item->'variants') not between 1 and 60 then raise exception 'Add 1–60 variants'; end if;
 if jsonb_typeof(coalesce(item->'photos','[]'::jsonb)) <> 'array' then raise exception 'Invalid photos'; end if;
 select coalesce(array_agg(value),'{}') into paths from jsonb_array_elements_text(coalesce(item->'photos','[]'::jsonb));
 if cardinality(paths)>8 then raise exception 'Use up to eight product photos'; end if;
 foreach image_path in array paths loop
  if image_path !~ '^[a-f0-9-]+\.webp$' or not exists(select 1 from storage.objects where bucket_id='bagz-store-media' and name=image_path) then raise exception 'Use an uploaded product photo'; end if;
 end loop;
 insert into public.bagz_products(id,name,description,category,visible,material,care,photos)
 values(pid,trim(item->>'name'),item->>'description',item->>'category',coalesce((item->>'visible')::boolean,false),coalesce(item->>'material',''),coalesce(item->>'care',''),paths)
 on conflict(id) do update set name=excluded.name,description=excluded.description,category=excluded.category,visible=excluded.visible,material=excluded.material,care=excluded.care,photos=excluded.photos;
 for v in select value from jsonb_array_elements(item->'variants') loop
  vid=coalesce(nullif(v->>'id','')::uuid,gen_random_uuid());
  if vid=any(seen) then raise exception 'Duplicate variant'; end if; seen=array_append(seen,vid);
  select * into oldrow from public.bagz_variants where id=vid for update;
  if found and oldrow.product_id<>pid then raise exception 'Variant belongs to another product'; end if;
  insert into public.bagz_variants(id,product_id,colour,size,price,cost,stock)
  values(vid,pid,trim(v->>'colour'),trim(v->>'size'),(v->>'price')::integer,(v->>'cost')::integer,(v->>'stock')::integer)
  on conflict(id) do update set colour=excluded.colour,size=excluded.size,price=excluded.price,cost=excluded.cost,stock=excluded.stock;
  if coalesce(oldrow.stock,0)<>(v->>'stock')::integer then
   insert into public.bagz_stock_history(variant_id,delta,reason,actor) values(vid,(v->>'stock')::integer-coalesce(oldrow.stock,0),'Product editor stock update',auth.uid());
  end if;
 end loop;
 if exists(select 1 from public.bagz_variants where product_id=pid and not(id=any(seen))) then raise exception 'Keep existing variants; set their stock to zero instead'; end if;
 return pid;
end $$;

create or replace function public.bagz_save_settings(settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare field_name text; media_path text; gallery jsonb; gallery_path text; result jsonb;
begin
 if not public.bagz_is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if jsonb_typeof(settings) is distinct from 'object' then raise exception 'Invalid settings'; end if;
 foreach field_name in array array['logo','bagDisplay','shoeDisplay'] loop
  media_path=coalesce(settings->>field_name,'');
  if media_path<>'' and media_path not in ('/oreva-logo.jpg','/brand-logo.png') then
   if media_path !~ '^[a-f0-9-]+\.webp$' or not exists(select 1 from storage.objects where bucket_id='bagz-store-media' and name=media_path) then raise exception 'Use an uploaded store image'; end if;
  end if;
 end loop;
 gallery=coalesce(settings->'displayGallery','[]'::jsonb);
 if jsonb_typeof(gallery) is distinct from 'array' or jsonb_array_length(gallery)>8 then raise exception 'Use up to eight storefront images'; end if;
 for gallery_path in select jsonb_array_elements_text(gallery) loop
  if gallery_path !~ '^[a-f0-9-]+\.webp$' or not exists(select 1 from storage.objects where bucket_id='bagz-store-media' and name=gallery_path) then raise exception 'Use uploaded storefront images'; end if;
 end loop;
 update public.bagz_settings set value=value || jsonb_build_object(
  'brand',left(coalesce(nullif(trim(settings->>'brand'),''),value->>'brand'),80),
  'logo',coalesce(settings->>'logo',value->>'logo'),
  'tagline',left(coalesce(settings->>'tagline',value->>'tagline'),180),
  'ownerEmail',left(coalesce(settings->>'ownerEmail',value->>'ownerEmail',''),254),
  'whatsapp',left(coalesce(settings->>'whatsapp',value->>'whatsapp',''),20),
  'pickupInstructions',left(coalesce(settings->>'pickupInstructions',value->>'pickupInstructions'),1000),
  'pickupTime',left(coalesce(settings->>'pickupTime',value->>'pickupTime'),160),
  'lowStock',greatest(0,least(100,coalesce((settings->>'lowStock')::integer,3))),
  'emailEnabled',coalesce((settings->>'emailEnabled')::boolean,false),
  'pushEnabled',false,
  'deliveryAreas',coalesce(settings->'deliveryAreas','[]'::jsonb),
  'bagDisplay',coalesce(settings->>'bagDisplay',value->>'bagDisplay',''),
  'shoeDisplay',coalesce(settings->>'shoeDisplay',value->>'shoeDisplay','')
    ,'displayGallery',gallery
 ) where id=true returning value into result;
 return result;
end $$;
revoke all on function public.bagz_save_settings(jsonb) from public,anon;
grant execute on function public.bagz_save_settings(jsonb) to authenticated;
commit;
