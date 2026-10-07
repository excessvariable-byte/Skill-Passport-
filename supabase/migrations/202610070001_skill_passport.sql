-- Apply once to a new Supabase project. Authentication identities are Supabase UUIDs.
-- All credentials in this prototype are explicitly simulated, never issuer-verified.
begin;
create table public.profiles (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 2 and 80),
 home_city text not null check (home_city in ('Delhi','Patna','Mumbai','Kolkata','Bengaluru')),
 destination text not null check (destination in ('Delhi','Patna','Mumbai','Kolkata','Bengaluru')),
 months integer not null check(months between 0 and 600),
 deliveries integer not null check(deliveries between 0 and 1000000),
 rating numeric not null check(rating between 0 and 5),
 on_time numeric not null check(on_time between 0 and 100),
 payments boolean not null default false,
 consent boolean not null check(consent = true),
 is_sample boolean not null default false,
 target_role text not null check(target_role in ('hub','warehouse','support','dispatch')),
 updated_at timestamptz not null default now()
);
create table public.credentials (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(owner_id) on delete cascade,
 course_id text not null check(course_id in ('inventory','software','coordination')),
 status text not null default 'demo' check(status='demo'),
 completed_at timestamptz not null default now(),
 unique(owner_id,course_id)
);
alter table public.profiles enable row level security;
alter table public.credentials enable row level security;
revoke all on public.profiles,public.credentials from anon;
revoke all on public.profiles,public.credentials from authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select,insert on public.credentials to authenticated;
create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid())=owner_id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid())=owner_id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy credentials_read_own on public.credentials for select to authenticated using ((select auth.uid())=owner_id);
create policy credentials_insert_own on public.credentials for insert to authenticated with check ((select auth.uid())=owner_id);
commit;
