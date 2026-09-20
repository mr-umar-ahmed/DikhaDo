import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const TIMEOUT_MS = 10_000;

/**
 * On one bar a request can stall without ever failing, which would leave a button dimmed forever.
 * Every call gives up after ten seconds and surfaces as an ordinary error the screens already handle.
 * The error is renamed to AbortError so postgrest-js does not quietly retry the stalled call.
 */
const timedFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal })
    .catch((e) => {
      throw controller.signal.aborted ? Object.assign(new Error('timeout'), { name: 'AbortError' }) : e;
    })
    .finally(() => clearTimeout(timer));
};

/**
 * Null until mobile/.env carries the project URL and anon key (see .env.example).
 * Callers must handle null: the app stays usable from its local cache without a backend.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        global: { fetch: timedFetch },
      })
    : null;
