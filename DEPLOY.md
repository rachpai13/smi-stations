# Putting SMI Stations online

## 1. Supabase (so everyone sees everyone's characters)

1. Supabase dashboard → **Authentication → Sign In / Providers** → turn on **Allow anonymous sign-ins** → Save.
2. **SQL Editor → New query** → paste all of `smi-map/stations-setup.sql` → **Run**.
3. New query again → paste all of `smi-map/track-setup.sql` → **Run**.

Never put the service_role / secret key or the database password in these files. The publishable key in `smi-map/supabase.js` is meant to be public.

## 2. GitKraken → GitHub

1. GitKraken → **File → Open Repo** → this folder (`D:\year 3 design work\figma campus`).
   (If it isn't a repo yet: **File → Init Repo** → this folder.)
2. Stage everything → commit message "SMI Stations" → **Commit**.
3. **Push** → when it asks for a remote, pick **GitHub**, create a new repository (e.g. `smi-stations`) → Push.

## 3. Netlify

1. netlify.com → **Add new site → Import an existing project → GitHub** → pick the repo.
2. Netlify reads `netlify.toml`: publish directory `smi-map`, no build command. Click **Deploy**.
3. Every later push from GitKraken redeploys the site automatically.

## 4. Check it

Open the Netlify link on two phones. Add a character on one, refresh the other: it should be there.
