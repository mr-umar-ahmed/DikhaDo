import AsyncStorage from '@react-native-async-storage/async-storage';
import { addNetworkStateListener } from 'expo-network';
import type { Lang } from '@/theme/type';
import { attachMedia } from './media';
import { createJob, IdentityGone, registerCustomer, savedCustomer, type Job } from './requests';

/**
 * Bookings made with no signal. Written to the phone first, sent when a connection appears, and
 * safe to send twice: every entry carries the booking key minted when the customer tapped Request,
 * so a retry after a lost reply finds the first job instead of making a second.
 */
export type Queued = {
  clientId: string;
  workerId: string;
  workerName: string;
  workerPhone?: string;
  category: string;
  lat: number;
  lng: number;
  transcript?: string;
  urgent?: boolean;
  visionConf?: number;
  photoUri?: string;
  voiceUri?: string;
  /** Set when the customer had never booked before and could not be registered offline either. */
  newCustomer?: { name: string; phone: string; lang: Lang };
  queuedAt: number;
};

const KEY = 'dikhado.outbox.v1';
const listeners = new Set<(sent: Job) => void>();

async function load(): Promise<Queued[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as Queued[];
  } catch {
    return [];
  }
}
const save = (list: Queued[]) => AsyncStorage.setItem(KEY, JSON.stringify(list));

export async function enqueue(entry: Queued) {
  const list = await load();
  if (!list.some((q) => q.clientId === entry.clientId)) list.push(entry);
  await save(list);
}

export const queued = load;

/** Called with each job the moment it leaves the phone, so an open "waiting" screen can move on. */
export function onSent(fn: (job: Job) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let flushing = false;

export async function flushOutbox(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const entry of await load()) {
      try {
        const me = (await savedCustomer()) ?? (entry.newCustomer ? await registerCustomer(entry.newCustomer.name, entry.newCustomer.phone, entry.newCustomer.lang) : null);
        if (!me) throw new Error('no customer identity');
        const job = await createJob({
          clientId: entry.clientId, customerId: me.profileId, workerId: entry.workerId, category: entry.category,
          lat: entry.lat, lng: entry.lng, transcript: entry.transcript, urgent: entry.urgent, visionConf: entry.visionConf,
        });
        attachMedia(job.id, { photoUri: entry.photoUri, voiceUri: entry.voiceUri });
        await save((await load()).filter((q) => q.clientId !== entry.clientId));
        sent++;
        listeners.forEach((fn) => fn(job));
      } catch (e) {
        // A vanished profile will never succeed: drop the entry rather than retry forever.
        if (e instanceof IdentityGone) await save((await load()).filter((q) => q.clientId !== entry.clientId));
        // Anything else is "still no signal": leave it for the next attempt.
      }
    }
    return sent;
  } finally {
    flushing = false;
  }
}

/** Start once at launch: try now, try whenever the network comes back, and keep a slow heartbeat while anything waits. */
export function startOutbox() {
  flushOutbox().catch(() => {});
  addNetworkStateListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) flushOutbox().catch(() => {});
  });
  setInterval(async () => {
    if ((await load()).length > 0) flushOutbox().catch(() => {});
  }, 15_000);
}
