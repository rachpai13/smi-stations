-- Fix: let everyone see work images in open windows (run once in Supabase → SQL Editor → New query → Run).
-- The old rule compared the station's own "name" column instead of the file name, so only the owner
-- could load their work. "objects.name" makes it use the file's path.
drop policy if exists "stations files: read" on storage.objects;
create policy "stations files: read" on storage.objects for select to authenticated using (
  bucket_id = 'stations' and (
    (storage.foldername(name))[1] = 'covers'
    or (storage.foldername(name))[2] = auth.uid()::text
    or exists (select 1 from public.stations s where s.id::text = (storage.foldername(objects.name))[2] and s.is_open)
  )
);
