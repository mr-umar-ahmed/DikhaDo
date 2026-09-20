import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Lang } from '@/theme/type';

export type NearbyWorker = {
  profile_id: string;
  name: string;
  phone: string | null;
  village: string | null;
  languages: string[];
  verified: boolean;
  tier: 'new' | 'trusted' | 'star';
  rating_avg: number;
  rating_count: number;
  jobs_done: number;
  call_before_coming: boolean;
  distance_m: number;
  min_inr: number | null;
  max_inr: number | null;
};

export type WorkerProfile = { profileId: string; name: string; phone: string; skills: string[] };

export class BackendError extends Error {}

function client() {
  if (!supabase) throw new BackendError('not-configured');
  return supabase;
}

const cacheKey = (category: string) => `dikhado.workers.${category}`;

/**
 * Workers on duty near a point. On any failure, falls back to the last list seen for this
 * category so a customer on one bar still gets phone numbers to call. `stale` says which it was.
 */
export async function nearbyWorkers(lat: number, lng: number, category: string, lang: Lang) {
  try {
    const { data, error } = await client().rpc('nearby_workers', {
      p_lat: lat,
      p_lng: lng,
      p_category: category,
      p_lang: lang,
    });
    if (error) throw new BackendError(error.message);
    const workers = (data ?? []) as NearbyWorker[];
    AsyncStorage.setItem(cacheKey(category), JSON.stringify(workers)).catch(() => {});
    return { workers, stale: false };
  } catch (e) {
    const cached = await AsyncStorage.getItem(cacheKey(category)).catch(() => null);
    if (cached) return { workers: JSON.parse(cached) as NearbyWorker[], stale: true };
    throw e;
  }
}

export async function registerWorker(input: { name: string; phone: string; lang: Lang; skills: string[]; upiId?: string }): Promise<WorkerProfile> {
  const db = client();
  const { data: profile, error: e1 } = await db
    .from('profiles')
    .insert({ role: 'worker', name: input.name, phone: input.phone, lang: input.lang })
    .select('id')
    .single();
  if (e1 || !profile) throw new BackendError(e1?.message ?? 'profile insert failed');

  const { error: e2 } = await db
    .from('workers')
    .insert({ profile_id: profile.id, skills: input.skills, languages: [input.lang], upi_id: input.upiId || null });
  if (e2) throw new BackendError(e2.message);

  return { profileId: profile.id, name: input.name, phone: input.phone, skills: input.skills };
}

/** One cheap call keeps presence and location fresh. Customers only see workers seen in the last two minutes. */
export async function heartbeat(profileId: string, lat: number, lng: number, onDuty: boolean) {
  const { error } = await client().rpc('worker_heartbeat', {
    p_profile: profileId,
    p_lat: lat,
    p_lng: lng,
    p_on_duty: onDuty,
  });
  if (error) throw new BackendError(error.message);
}
