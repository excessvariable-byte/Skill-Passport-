-- Run as the Supabase SQL Editor owner. Entire test rolls back.
begin;
insert into auth.users(id,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-a@example.invalid'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rls-b@example.invalid');
insert into public.profiles(owner_id,name,home_city,destination,months,deliveries,rating,on_time,consent,target_role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Test A','Delhi','Delhi',12,100,4,90,true,'hub'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Test B','Patna','Delhi',12,100,4,90,true,'hub');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.profiles) <> 1 then raise exception 'RLS leaked another profile'; end if;
 update public.profiles set name='Changed A' where owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if not found then raise exception 'Own profile update failed'; end if;
 update public.profiles set name='Forbidden' where owner_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 if found then raise exception 'RLS permitted cross-user update'; end if;
 begin
  insert into public.credentials(owner_id,course_id) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','inventory');
  raise exception 'RLS permitted forged owner';
 exception when insufficient_privilege then null; end;
 insert into public.credentials(owner_id,course_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','inventory');
 insert into public.credentials(owner_id,course_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','inventory') on conflict(owner_id,course_id) do nothing;
 if (select count(*) from public.credentials) <> 1 then raise exception 'Completion not idempotent'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.credentials) then raise exception 'Credentials leaked'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform * from public.profiles;
  raise exception 'Anonymous access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: own access, cross-user isolation, anonymous denial, idempotent training; fixtures rolled back' as result;
