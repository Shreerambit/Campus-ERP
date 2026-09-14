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
let rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
if (rawUrl) {
  // Clean up common accidental prefix typos like ':https//' or 'https//'
  rawUrl = rawUrl.replace(/^:+/, '');
  if (rawUrl.startsWith('https//')) {
    rawUrl = 'https://' + rawUrl.slice(7);
  } else if (rawUrl.startsWith('http//')) {
    rawUrl = 'http://' + rawUrl.slice(6);
  }
}
const url = rawUrl;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

function initSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'campus.auth.v1'
      },
      db: { schema: 'public' },
      global: { headers: { 'x-application-name': 'campus-erp' } }
    });
  } catch (err) {
    console.error('Failed to initialize Supabase client (check VITE_SUPABASE_URL):', err);
    return null;
  }
}

export const supabase: SupabaseClient | null = initSupabase();

export const HAS_SUPABASE = !!supabase;
