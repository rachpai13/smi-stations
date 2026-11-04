-- Campus Track parking: run once in Supabase → SQL Editor → New query → Run
-- (after stations-setup.sql). Each student can park their character at one stop.

create table if not exists public.track_parks (
  user_id uuid primary key references public.stations(id) on delete cascade,
  stop_key text not null check (char_length(stop_key) <= 80),
  updated_at timestamptz not null default now()
);

alter table public.track_parks enable row level security;

-- Every logged-in student sees where everyone is parked; you can only move your own character.
drop policy if exists "parks: read" on public.track_parks;
create policy "parks: read" on public.track_parks for select to authenticated using (true);
drop policy if exists "parks: park mine" on public.track_parks;
create policy "parks: park mine" on public.track_parks for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "parks: move mine" on public.track_parks;
create policy "parks: move mine" on public.track_parks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "parks: leave" on public.track_parks;
create policy "parks: leave" on public.track_parks for delete to authenticated using (user_id = auth.uid());
