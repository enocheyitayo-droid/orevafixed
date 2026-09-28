-- Requires approval before applying: grants catalogue administration to two owners.
-- Preserves existing owner rows and all product/stock records.
begin;
do $$
begin
 if (select count(*) from auth.users where email_confirmed_at is not null and
   ((id='47c173a9-264b-45da-8c38-095e01b230df' and lower(email)='adetorooreoluwa27@gmail.com') or
    (id='a3518a3d-a448-4ad5-8c36-f34ba0d40c13' and lower(email)='enocheyitayo@gmail.com'))) <> 2 then
   raise exception 'Both designated, confirmed owner accounts must exist';
 end if;
end $$;
-- Remove the one-row limit; user_id remains unique and references auth.users.
alter table bagz_private.owners drop constraint if exists owners_pkey;
insert into bagz_private.owners(user_id) values
 ('47c173a9-264b-45da-8c38-095e01b230df'),
 ('a3518a3d-a448-4ad5-8c36-f34ba0d40c13')
on conflict(user_id) do nothing;
commit;
