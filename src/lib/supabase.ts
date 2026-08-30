import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client — auto-configures from Vite env variables.
 *
 * In `.env.local` (or Vercel env):
 *   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
 *
 * When the vars are missing, the app falls back to local demo data
 * (localStorage) so it still runs offline / without a backend.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'campus.auth.v1'
      },
      db: { schema: 'public' },
      global: { headers: { 'x-application-name': 'campus-erp' } }
    })
  : null;

export const HAS_SUPABASE = !!supabase;
