import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import type { CivicKind } from '@/ai/civic';
import type { FixVerdict, Signature } from '@/ai/signature';
import { BackendError } from './api';
import { supabase } from './supabase';

export type CivicStatus = 'open' | 'resolved_claimed' | 'verified_fixed' | 'reopened';

export type Ticket = {
  id: string;
  serial: string;
  kind: CivicKind;
  department: string;
  sla_hours: number;
  severity: number;
  lat: number;
  lng: number;
  photo_url: string | null;
  note: string | null;
  signatures: number;
  status: CivicStatus;
  created_at: string;
};

/** What this phone remembers about a report it made: enough to judge a re-scan with no network. */
export type MyReport = { id: string; serial: string; kind: CivicKind; photoUri?: string; strength: number; signature: Signature; at: number };

const KEY = 'dikhado.civic.v1';

function db() {
  if (!supabase) throw new BackendError('not-configured');
  return supabase;
}

export async function myReports(): Promise<MyReport[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as MyReport[];
  } catch {
    return [];
  }
}

/**
 * File a report. If the same kind of problem is already open within 60 m, the database adds this
 * citizen's signature to it instead of opening a second ticket: ten reports are one loud ticket,
 * not ten quiet ones.
 */
export async function reportCivic(input: {
  reporterId: string | null; kind: CivicKind; lat: number; lng: number; note?: string;
  photoUri?: string; strength: number; signature: Signature;
}): Promise<Ticket> {
  let photoUrl: string | null = null;
  if (input.photoUri) {
    // Best effort: a report without its photo is still a report.
    try {
      const file = new File(input.photoUri);
      const path = `civic/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const body = await file.bytes();
      const up = await db().storage.from('job-media').upload(path, body.buffer as ArrayBuffer, { contentType: 'image/jpeg' });
      if (!up.error) photoUrl = db().storage.from('job-media').getPublicUrl(path).data.publicUrl;
    } catch {
      photoUrl = null;
    }
  }

  const { data, error } = await db().rpc('report_civic', {
    p_reporter: input.reporterId, p_kind: input.kind, p_lat: input.lat, p_lng: input.lng,
    p_photo_url: photoUrl, p_note: input.note || null, p_signature: null,
  });
  if (error || !data) throw new BackendError(error?.message ?? 'report failed');
  const ticket = data as Ticket;

  const mine = await myReports();
  if (!mine.some((r) => r.id === ticket.id)) {
    mine.unshift({ id: ticket.id, serial: ticket.serial, kind: ticket.kind, photoUri: input.photoUri, strength: input.strength, signature: input.signature, at: Date.now() });
    await AsyncStorage.setItem(KEY, JSON.stringify(mine.slice(0, 30))).catch(() => {});
  }
  return ticket;
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const { data, error } = await db().from('civic_tickets').select('*').eq('id', id).maybeSingle();
  if (error) throw new BackendError(error.message);
  return data as Ticket | null;
}

/** The citizen's verdict is final: "fixed" closes the ticket; "still there" reopens one the department closed, on the record. */
export async function verifyCivic(id: string, verdict: Exclude<FixVerdict, 'unclear'>): Promise<Ticket> {
  const { data, error } = await db().rpc('verify_civic', { p_ticket: id, p_verdict: verdict });
  if (error || !data) throw new BackendError(error?.message ?? 'verify failed');
  return data as Ticket;
}
