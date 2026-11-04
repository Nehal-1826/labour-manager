import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // config error — surface it clearly in the browser console
  throw new Error(
    'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY ' +
    'to the .env file at the project root (see .env.example), then restart the dev server.'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,   // remember the administrator across browser restarts
    autoRefreshToken: true, // refresh the JWT automatically before expiry
    detectSessionInUrl: false,
  },
});
