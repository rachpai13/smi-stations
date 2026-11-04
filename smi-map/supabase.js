// Shared Supabase client. The publishable key is safe to ship in website code;
// never put the secret/service_role key here.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const SUPABASE_URL = 'https://kcduzulfkshcxtejzoms.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_o8tICU2WxehbzXvxzoQOAw_PjHqrchw';

// Only SMI student accounts. Also enforced in the database (see supabase-setup.sql).
export const ALLOWED_DOMAIN = '@learner.manipal.edu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
