import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { BackendError } from './api';
import { supabase } from './supabase';
import type { Lang } from '@/theme/type';

export type Status =
  | 'requested' | 'accepted' | 'on_the_way' | 'working' | 'done' | 'paid' | 'rated'
  | 'declined' | 'cancelled' | 'disputed';

type Party = { name: string; phone: string | null };

export type Job = {
  id: string;
  serial: string;
  customer_id: string;
  worker_id: string;
  category_code: string;
  status: Status;
  lat: number | null;
  lng: number | null;
  price_agreed: number | null;
  pay_method: 'cash' | 'upi' | null;
  created_at: string;
  worker: Party | null;
  customer: Party | null;
};

export type Customer = { profileId: string; name: string; phone: string };

const JOB_SELECT =
  '*,worker:profiles!requests_worker_id_fkey(name,phone),customer:profiles!requests_customer_id_fkey(name,phone)';
const CUSTOMER_KEY = 'dikhado.customer.v1';
const LAST_JOB_KEY = 'dikhado.lastJob.v1';
/** Realtime is the fast path; polling is the floor, for networks that block websockets. */
const POLL_MS = 5000;

function db() {
  if (!supabase) throw new BackendError('not-configured');
  return supabase;
}

// ── Customer identity ────────────────────────────────────────────────────────
export async function savedCustomer(): Promise<Customer | null> {
  const raw = await AsyncStorage.getItem(CUSTOMER_KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as Customer) : null;
}

export async function registerCustomer(name: string, phone: string, lang: Lang): Promise<Customer> {
  const { data, error } = await db().from('profiles').insert({ role: 'customer', name, phone, lang }).select('id').single();
  if (error || !data) throw new BackendError(error?.message ?? 'profile insert failed');
  const customer = { profileId: data.id as string, name, phone };
  await AsyncStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer)).catch(() => {});
  return customer;
}

// ── Job lifecycle ────────────────────────────────────────────────────────────
export async function createJob(input: { customerId: string; workerId: string; category: string; lat: number; lng: number }): Promise<Job> {
  const { data, error } = await db()
    .from('requests')
    .insert({
      // Minted on the phone so a retry after a dropped connection cannot create a second job.
      client_id: `${input.customerId}.${Date.now().toString(36)}`,
      customer_id: input.customerId,
      worker_id: input.workerId,
      category_code: input.category,
      lat: input.lat,
      lng: input.lng,
    })
    .select(JOB_SELECT)
    .single();
  if (error || !data) throw new BackendError(error?.message ?? 'request insert failed');
  await AsyncStorage.setItem(LAST_JOB_KEY, (data as Job).id).catch(() => {});
  return data as Job;
}

export async function getJob(id: string): Promise<Job | null> {
  const { data, error } = await db().from('requests').select(JOB_SELECT).eq('id', id).maybeSingle();
  if (error) throw new BackendError(error.message);
  return data as Job | null;
}

export async function setStatus(id: string, status: Status, extra: Partial<Pick<Job, 'price_agreed' | 'pay_method'>> = {}) {
  const { error } = await db().from('requests').update({ status, ...extra }).eq('id', id);
  if (error) throw new BackendError(error.message);
}

export async function rateJob(job: Job, stars: number, tags: string[]) {
  // A database trigger folds the rating into the worker's average, job count and tier, and marks the job rated.
  const { error } = await db().from('ratings').insert({ request_id: job.id, worker_id: job.worker_id, stars, tags });
  if (error) throw new BackendError(error.message);
}

export async function workerUpi(workerId: string): Promise<string | null> {
  const { data } = await db().from('workers').select('upi_id').eq('profile_id', workerId).maybeSingle();
  return (data?.upi_id as string | null) ?? null;
}

export const lastJobId = () => AsyncStorage.getItem(LAST_JOB_KEY).catch(() => null);
export const isOpen = (s: Status) => !['rated', 'declined', 'cancelled'].includes(s);

// ── Live views ───────────────────────────────────────────────────────────────
/** One job, kept current. `undefined` while loading, `null` if it does not exist. */
export function useLiveJob(id: string | null) {
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);

  const pull = useCallback(async () => {
    if (!id) return setJob(null);
    try {
      setJob(await getJob(id));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    pull();
    const timer = setInterval(pull, POLL_MS);
    const channel = supabase
      ?.channel(`job-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${id}` }, pull)
      .subscribe();
    return () => {
      clearInterval(timer);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [id, pull]);

  return { job, offline, refresh: pull };
}

/** Everything a worker still has to act on, newest first. */
export function useWorkerInbox(workerId: string, active: boolean) {
  const [jobs, setJobs] = useState<Job[]>([]);

  const pull = useCallback(async () => {
    try {
      const { data, error } = await db()
        .from('requests')
        .select(JOB_SELECT)
        .eq('worker_id', workerId)
        .in('status', ['requested', 'accepted', 'on_the_way', 'working', 'done'])
        .order('created_at', { ascending: false });
      if (!error) setJobs((data ?? []) as Job[]);
    } catch {
      // Keep showing the last list; the next poll will try again.
    }
  }, [workerId]);

  useEffect(() => {
    if (!active) return;
    pull();
    const timer = setInterval(pull, POLL_MS);
    const channel = supabase
      ?.channel(`inbox-${workerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `worker_id=eq.${workerId}` }, pull)
      .subscribe();
    return () => {
      clearInterval(timer);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [workerId, active, pull]);

  return { jobs, refresh: pull };
}

export function distanceMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}
