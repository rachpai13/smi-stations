-- SMI Poster Wall prototype: run once in Supabase → SQL Editor → New query → Run.
-- Open to everyone (no login) for testing. Tighten before the real launch.

-- Folders. delete_key is a secret only the creator's browser knows.
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  delete_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.posters (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

alter table public.folders enable row level security;
alter table public.posters enable row level security;

-- Everyone can see folders (but never the delete_key) and posters.
revoke select on public.folders from anon, authenticated;
grant select (id, name, created_at) on public.folders to anon, authenticated;

drop policy if exists "wall: read folders" on public.folders;
create policy "wall: read folders" on public.folders for select to anon, authenticated using (true);
drop policy if exists "wall: create folders" on public.folders;
create policy "wall: create folders" on public.folders for insert to anon, authenticated with check (true);

drop policy if exists "wall: read posters" on public.posters;
create policy "wall: read posters" on public.posters for select to anon, authenticated using (true);
drop policy if exists "wall: add posters" on public.posters;
create policy "wall: add posters" on public.posters for insert to anon, authenticated with check (true);

-- Only someone holding the folder's delete_key can delete it.
-- Returns the poster file paths so the page can remove the images too.
create or replace function public.delete_folder(folder uuid, key text)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.folders where id = folder and delete_key = key) then
    raise exception 'Not your folder';
  end if;
  return query select p.path from public.posters p where p.folder_id = folder;
  delete from public.folders where id = folder;
end;
$$;
grant execute on function public.delete_folder(uuid, text) to anon, authenticated;

-- Public image bucket: images only, max 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "wall: upload posters" on storage.objects;
create policy "wall: upload posters" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'posters');
-- Storage needs read access to delete a file.
drop policy if exists "wall: see poster files" on storage.objects;
create policy "wall: see poster files" on storage.objects for select to anon, authenticated
  using (bucket_id = 'posters');
drop policy if exists "wall: remove posters" on storage.objects;
create policy "wall: remove posters" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'posters');
