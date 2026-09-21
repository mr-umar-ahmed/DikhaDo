import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  photo_url: string | null;
  voice_url: string | null;
  transcript?: string | null;
  urgent?: boolean;
  created_at: string;
  updated_at: string;
  worker: Party | null;
  customer: Party | null;
};

export type Customer = { profileId: string; name: string; phone: string };

/** The other phone moved the job first. Not a failure: reload and show the truth. */
export class StaleJob extends Error {}
/** This phone's saved profile no longer exists on the server. */
export class IdentityGone extends Error {}

const JOB_SELECT =
  '*,worker:profiles!requests_worker_id_fkey(name,phone),customer:profiles!requests_customer_id_fkey(name,phone)';
const CUSTOMER_KEY = 'dikhado.customer.v1';
const LAST_JOB_KEY = 'dikhado.lastJob.v1';
const inboxKey = (workerId: string) => `dikhado.inbox.${workerId}`;
/** Realtime is the fast path; polling is the floor, for networks that block websockets. */
const POLL_MS = 5000;
/** A paid job stays on the worker's screen this long, so payment is seen rather than the card vanishing. */
const PAID_VISIBLE_MS = 15 * 60_000;

function db() {
  if (!supabase) throw new BackendError('not-configured');
  return supabase;
}

/** A key minted once per attempt-to-book, so a retry after a lost response finds the first job instead of making a second. */
export const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ── Customer identity ────────────────────────────────────────────────────────
export async function savedCustomer(): Promise<Customer | null> {
  const raw = await AsyncStorage.getItem(CUSTOMER_KEY).catch(() => null);
  return raw ? (JSON.parse(raw) as Customer) : null;
}

export const forgetCustomer = () => AsyncStorage.removeItem(CUSTOMER_KEY).catch(() => {});

export async function registerCustomer(name: string, phone: string, lang: Lang): Promise<Customer> {
  const { data, error } = await db().from('profiles').insert({ role: 'customer', name, phone, lang }).select('id').single();
  if (error || !data) throw new BackendError(error?.message ?? 'profile insert failed');
  const customer = { profileId: data.id as string, name, phone };
  await AsyncStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer)).catch(() => {});
  return customer;
}

// ── Job lifecycle ────────────────────────────────────────────────────────────
export async function createJob(input: {
  clientId: string; customerId: string; workerId: string; category: string; lat: number; lng: number;
  transcript?: string; urgent?: boolean; visionConf?: number;
}): Promise<Job> {
  const base = {
    client_id: input.clientId,
    customer_id: input.customerId,
    worker_id: input.workerId,
    category_code: input.category,
    lat: input.lat,
    lng: input.lng,
    vision_conf: input.visionConf ?? null,
  };
  const extra = { transcript: input.transcript ?? null, urgent: input.urgent ?? false };
  let { data, error } = await db().from('requests').insert({ ...base, ...extra }).select(JOB_SELECT).single();
  // A database that has not had migration 0004 yet must still take the booking.
  if (error && (error.code === 'PGRST204' || error.code === '42703')) {
    ({ data, error } = await db().from('requests').insert(base).select(JOB_SELECT).single());
  }

  let job = data as Job | null;
  if (error?.code === '23505') {
    // The first attempt did reach the server; only its reply was lost. Use that job.
    const existing = await db().from('requests').select(JOB_SELECT).eq('client_id', input.clientId).maybeSingle();
    job = existing.data as Job | null;
  } else if (error?.code === '23503') {
    throw new IdentityGone();
  }
  if (!job) throw new BackendError(error?.message ?? 'request insert failed');

  await AsyncStorage.setItem(LAST_JOB_KEY, job.id).catch(() => {});
  bookings++;
  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  const { data, error } = await db().from('requests').select(JOB_SELECT).eq('id', id).maybeSingle();
  if (error) throw new BackendError(error.message);
  return data as Job | null;
}

/**
 * Move a job from the status this phone last saw. If the other phone got there first the update
 * matches no row and we throw StaleJob; the database refuses illegal moves as a second line.
 */
export async function moveJob(job: Pick<Job, 'id' | 'status'>, to: Status, extra: Partial<Pick<Job, 'price_agreed' | 'pay_method'>> = {}) {
  const { data, error } = await db()
    .from('requests')
    .update({ status: to, ...extra })
    .eq('id', job.id)
    .eq('status', job.status)
    .select('id');
  if (error) throw error.code === 'P0001' ? new StaleJob() : new BackendError(error.message);
  if (!data || data.length === 0) throw new StaleJob();
}

export async function rateJob(job: Job, stars: number, tags: string[]) {
  // A database trigger folds the rating into the worker's average and tier, and marks the job rated.
  const { error } = await db().from('ratings').insert({ request_id: job.id, worker_id: job.worker_id, stars, tags });
  // 23505: already rated (a retry after a lost reply). Treat as done.
  if (error && error.code !== '23505') throw error.code === 'P0001' ? new StaleJob() : new BackendError(error.message);
}

export async function workerUpi(workerId: string): Promise<string | null> {
  const { data } = await db().from('workers').select('upi_id').eq('profile_id', workerId).maybeSingle();
  return (data?.upi_id as string | null) ?? null;
}

let bookings = 0;
/** How many jobs this session has booked. Lets the camera screen start fresh after one. */
export const bookingCount = () => bookings;

export const isOpen = (s: Status) => !['rated', 'declined', 'cancelled', 'disputed'].includes(s);

/**
 * The customer's job in progress, if any. With no signal we cannot check, so we assume the last
 * job is still open: showing a banner that leads to a finished job is better than hiding a live one.
 */
export async function openJobId(): Promise<string | null> {
  const id = await AsyncStorage.getItem(LAST_JOB_KEY).catch(() => null);
  if (!id) return null;
  try {
    const job = await getJob(id);
    if (job && isOpen(job.status)) return job.id;
    // Finished or gone: forget it, so an offline check later cannot resurrect it.
    await AsyncStorage.removeItem(LAST_JOB_KEY).catch(() => {});
    return null;
  } catch {
    return id;
  }
}

// ── Live views ───────────────────────────────────────────────────────────────
/**
 * Subscribe to row changes and poll as a floor. The topic is unique per subscription: realtime-js
 * hands back the existing channel for a repeated topic and then throws when a listener is added.
 * Any realtime failure degrades to polling instead of crashing the screen.
 */
function watch(topic: string, filter: string, event: 'UPDATE' | '*', pull: () => void) {
  pull();
  const timer = setInterval(pull, POLL_MS);
  let channel: ReturnType<NonNullable<typeof supabase>['channel']> | undefined;
  try {
    channel = supabase
      ?.channel(`${topic}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event, schema: 'public', table: 'requests', filter }, pull)
      .subscribe();
  } catch {
    // Polling still covers it.
  }
  return () => {
    clearInterval(timer);
    if (channel) supabase?.removeChannel(channel).catch(() => {});
  };
}

/** Run one pull at a time, so slow polls cannot pile up ahead of the user's own taps. */
function useSinglePull(fn: () => Promise<void>) {
  const inFlight = useRef(false);
  return useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await fn();
    } finally {
      inFlight.current = false;
    }
  }, [fn]);
}

/** One job, kept current. `undefined` while loading, `null` if it does not exist. */
export function useLiveJob(id: string | null) {
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    if (!id) return setJob(null);
    try {
      setJob(await getJob(id));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [id]);
  const pull = useSinglePull(load);

  useEffect(() => {
    if (!id) return;
    return watch(`job-${id}`, `id=eq.${id}`, 'UPDATE', pull);
  }, [id, pull]);

  return { job, offline, refresh: pull };
}

/** Everything a worker still has to act on, newest first. Survives a cold start with no signal. */
export function useWorkerInbox(workerId: string) {
  const [jobs, setJobs] = useState<Job[] | undefined>(undefined);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await db()
        .from('requests')
        .select(JOB_SELECT)
        .eq('worker_id', workerId)
        .in('status', ['requested', 'accepted', 'on_the_way', 'working', 'done', 'paid'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      const recent = ((data ?? []) as Job[]).filter(
        (j) => j.status !== 'paid' || Date.now() - new Date(j.updated_at).getTime() < PAID_VISIBLE_MS,
      );
      setJobs(recent);
      setOffline(false);
      AsyncStorage.setItem(inboxKey(workerId), JSON.stringify(recent)).catch(() => {});
    } catch {
      setOffline(true);
      // First load with no signal: show what this phone last knew, not "No jobs yet".
      const raw = await AsyncStorage.getItem(inboxKey(workerId)).catch(() => null);
      setJobs((current) => current ?? (raw ? (JSON.parse(raw) as Job[]) : undefined));
    }
  }, [workerId]);
  const pull = useSinglePull(load);

  useEffect(() => watch(`inbox-${workerId}`, `worker_id=eq.${workerId}`, '*', pull), [workerId, pull]);

  return { jobs, offline, refresh: pull };
}

export function distanceMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}
