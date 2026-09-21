import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { supabase } from './supabase';

/**
 * Text first, media later. A job reaches the worker as ~2 KB of text the moment it is sent; the
 * photo (~150 KB) and voice note (~20 KB) follow when the connection allows, and keep retrying
 * across app restarts. On one bar of signal the worker still gets the job.
 */
type Upload = { jobId: string; kind: 'photo' | 'voice'; uri: string; tries: number };

const KEY = 'dikhado.uploads.v1';
const BUCKET = 'job-media';
const MAX_TRIES = 8;

const spec = {
  photo: { name: 'photo.jpg', type: 'image/jpeg', column: 'photo_url' },
  voice: { name: 'voice.m4a', type: 'audio/mp4', column: 'voice_url' },
} as const;

async function load(): Promise<Upload[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as Upload[];
  } catch {
    return [];
  }
}
const save = (list: Upload[]) => AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});

/** Remember what has to go up for this job, then try at once. Never throws: booking must not depend on it. */
export async function attachMedia(jobId: string, media: { photoUri?: string; voiceUri?: string }) {
  const list = await load();
  if (media.photoUri) list.push({ jobId, kind: 'photo', uri: media.photoUri, tries: 0 });
  if (media.voiceUri) list.push({ jobId, kind: 'voice', uri: media.voiceUri, tries: 0 });
  await save(list);
  flushUploads();
}

let flushing = false;

/** Send whatever is waiting. Safe to call often: on app start, on focus, after a booking. */
export async function flushUploads(): Promise<{ sent: number; waiting: number; bytes: number }> {
  if (flushing || !supabase) return { sent: 0, waiting: 0, bytes: 0 };
  flushing = true;
  let sent = 0;
  let bytes = 0;
  try {
    const list = await load();
    const keep: Upload[] = [];
    for (const item of list) {
      try {
        const file = new File(item.uri.startsWith('file://') ? item.uri : `file://${item.uri}`);
        if (!file.exists) continue; // the OS cleared the cache: nothing left to send
        const body = await file.bytes();
        const s = spec[item.kind];
        const path = `${item.jobId}/${s.name}`;
        const up = await supabase.storage.from(BUCKET).upload(path, body.buffer as ArrayBuffer, { contentType: s.type, upsert: true });
        if (up.error) throw up.error;
        const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        const patch = await supabase.from('requests').update({ [s.column]: url }).eq('id', item.jobId);
        if (patch.error) throw patch.error;
        sent++;
        bytes += body.byteLength;
      } catch {
        if (item.tries + 1 < MAX_TRIES) keep.push({ ...item, tries: item.tries + 1 });
      }
    }
    await save(keep);
    return { sent, waiting: keep.length, bytes };
  } finally {
    flushing = false;
  }
}
