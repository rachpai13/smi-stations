-- SMI Stations: run once in Supabase → SQL Editor → New query → Run.
-- Every logged-in student gets one airplane window (station). Covers are visible to all students;
-- work is visible to all students while the window is open, and only to its owner while friends-only.

create table if not exists public.stations (
  id uuid primary key references auth.users(id) on delete cascade,
  seat bigint generated always as identity unique,   -- joining order (fills free windows)
  slot integer unique check (slot >= 0),              -- the window a student picked with "+"
  name text not null default 'New student' check (char_length(name) between 1 and 30),
  year text not null default '' check (char_length(year) <= 20),
  major text not null default '' check (char_length(major) <= 40),
  is_open boolean not null default true,
  cover_path text,
  updated_at timestamptz not null default now()
);

-- In case the table was created before "slot" existed
alter table public.stations add column if not exists slot integer unique check (slot >= 0);

create table if not exists public.station_works (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  path text not null,
  type text not null,
  title text not null default '' check (char_length(title) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists station_works_station_idx on public.station_works (station_id, created_at);

alter table public.stations enable row level security;
alter table public.station_works enable row level security;

-- Stations: any logged-in student can see every window; you can only create/edit your own.
drop policy if exists "stations: read" on public.stations;
create policy "stations: read" on public.stations for select to authenticated using (true);
drop policy if exists "stations: create mine" on public.stations;
create policy "stations: create mine" on public.stations for insert to authenticated with check (id = auth.uid());
drop policy if exists "stations: edit mine" on public.stations;
create policy "stations: edit mine" on public.stations for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Work: visible when the window is open (or it's yours); only you can add/remove your own.
drop policy if exists "works: read" on public.station_works;
create policy "works: read" on public.station_works for select to authenticated using (
  station_id = auth.uid()
  or exists (select 1 from public.stations s where s.id = station_id and s.is_open)
);
drop policy if exists "works: add mine" on public.station_works;
create policy "works: add mine" on public.station_works for insert to authenticated with check (station_id = auth.uid());
drop policy if exists "works: remove mine" on public.station_works;
create policy "works: remove mine" on public.station_works for delete to authenticated using (station_id = auth.uid());

-- Private file bucket: images and short videos up to 20 MB.
-- Files live at covers/<user id>/... and works/<user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stations', 'stations', false, 20971520,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

drop policy if exists "stations files: read" on storage.objects;
create policy "stations files: read" on storage.objects for select to authenticated using (
  bucket_id = 'stations' and (
    (storage.foldername(name))[1] = 'covers'
    or (storage.foldername(name))[2] = auth.uid()::text
    or exists (select 1 from public.stations s where s.id::text = (storage.foldername(name))[2] and s.is_open)
  )
);
drop policy if exists "stations files: upload mine" on storage.objects;
create policy "stations files: upload mine" on storage.objects for insert to authenticated with check (
  bucket_id = 'stations'
  and (storage.foldername(name))[1] in ('covers', 'works')
  and (storage.foldername(name))[2] = auth.uid()::text
);
drop policy if exists "stations files: remove mine" on storage.objects;
create policy "stations files: remove mine" on storage.objects for delete to authenticated using (
  bucket_id = 'stations' and (storage.foldername(name))[2] = auth.uid()::text
);
