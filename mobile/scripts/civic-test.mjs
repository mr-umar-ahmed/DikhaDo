// Backend test for everything migration 0004 added: the civic rail (routing, duplicate merge,
// false-closure reopen), storage buckets, the verification trigger, and the new job columns.
// Uses a spot in the Arabian Sea so it can never merge with a real report, and removes what it makes.
//   cd mobile && node scripts/civic-test.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const db = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const HERE = { lat: 12.34567, lng: 66.54321 };
const metres = (m) => m / 111_320; // degrees of latitude
const made = { tickets: new Set(), profiles: [], requests: [], objects: [] };
const report = (kind, lat, lng, extra = {}) => db.rpc('report_civic', { p_reporter: null, p_kind: kind, p_lat: lat, p_lng: lng, p_photo_url: null, p_note: null, p_signature: null, ...extra });

try {
  // ── routing + duplicate merge ────────────────────────────────────────────
  const first = await report('garbage', HERE.lat, HERE.lng, { p_note: 'civic-test' });
  check('a report is filed', !first.error && !!first.data?.id, first.error?.message ?? first.data?.serial);
  const t = first.data;
  made.tickets.add(t.id);
  check('serial is minted', /^CIV-\d{4}-\d{6}$/.test(t.serial), t.serial);
  check('the routing table chose department, deadline and severity', t.department.startsWith('Sanitation') && t.sla_hours === 12 && t.severity === 3, `${t.department}, ${t.sla_hours} h, severity ${t.severity}`);
  check('starts open with one signature and a location', t.status === 'open' && t.signatures === 1 && t.geog != null);

  const again = await report('garbage', HERE.lat + metres(30), HERE.lng);
  made.tickets.add(again.data?.id);
  check('the same problem 30 m away adds a signature instead of a ticket', again.data?.id === t.id && again.data?.signatures === 2, `signatures=${again.data?.signatures}`);

  const other = await report('streetlight', HERE.lat, HERE.lng);
  made.tickets.add(other.data?.id);
  check('a different kind at the same spot is its own ticket, routed elsewhere', other.data?.id !== t.id && other.data?.department === 'Street lighting' && other.data?.sla_hours === 48);

  const far = await report('garbage', HERE.lat + metres(250), HERE.lng);
  made.tickets.add(far.data?.id);
  check('the same kind 250 m away is a separate ticket', !!far.data?.id && far.data.id !== t.id);

  const bogus = await report('dragon', HERE.lat, HERE.lng);
  if (bogus.data?.id) made.tickets.add(bogus.data.id);
  check('an unknown kind is refused', !!bogus.error, bogus.error?.message ?? 'accepted!');

  // ── accountability: a false closure is reopened and stays on the record ──
  const quiet = await db.rpc('verify_civic', { p_ticket: t.id, p_verdict: 'still_broken' });
  check('"still there" on an open ticket changes nothing', quiet.data?.status === 'open');
  const claimed = await db.from('civic_tickets').update({ status: 'resolved_claimed' }).eq('id', t.id).select('status').single();
  check('the department can mark it resolved', claimed.data?.status === 'resolved_claimed', claimed.error?.message);
  const reopened = await db.rpc('verify_civic', { p_ticket: t.id, p_verdict: 'still_broken' });
  check('a citizen re-scan saying "still there" reopens it', reopened.data?.status === 'reopened', reopened.error?.message ?? reopened.data?.status);
  const fixed = await db.rpc('verify_civic', { p_ticket: t.id, p_verdict: 'fixed' });
  check('a citizen re-scan saying "fixed" closes it', fixed.data?.status === 'verified_fixed');
  const events = await db.from('civic_events').select('what').eq('ticket_id', t.id).order('id');
  const trail = (events.data ?? []).map((e) => e.what).join(' > ');
  check('the whole history is on the record, false closure included', trail === 'reported > signed > reopened_false_closure > verified_fixed', trail);
  const afterFix = await report('garbage', HERE.lat, HERE.lng);
  made.tickets.add(afterFix.data?.id);
  check('a new heap at a fixed spot opens a fresh ticket', !!afterFix.data?.id && afterFix.data.id !== t.id);

  // ── hardening (migration 0005) ───────────────────────────────────────────
  const SPOT = { lat: HERE.lat + metres(2000), lng: HERE.lng };
  const seeded = await db.from('civic_tickets').insert({ kind: 'drain', department: 'Sewerage and drainage', sla_hours: 24, severity: 4, lat: SPOT.lat, lng: SPOT.lng, signatures: 7, note: 'civic-test direct insert' }).select('id,geog').single();
  made.tickets.add(seeded.data?.id);
  check('a ticket inserted with plain lat/lng gets its geography', seeded.data?.geog != null, seeded.error?.message ?? 'geog is null');
  const joins = await report('drain', SPOT.lat + metres(20), SPOT.lng);
  made.tickets.add(joins.data?.id);
  check('a citizen report next to a seeded ticket joins it (7 -> 8)', joins.data?.id === seeded.data?.id && joins.data?.signatures === 8, `signatures=${joins.data?.signatures}`);

  const ghost = await report('pothole', SPOT.lat, SPOT.lng, { p_reporter: '00000000-0000-0000-0000-00000000dead' });
  made.tickets.add(ghost.data?.id);
  check('a phone whose profile was deleted can still report, as an anonymous citizen', !ghost.error && ghost.data?.reporter_id === null, ghost.error?.message);

  const me = await db.from('profiles').insert({ role: 'customer', name: 'ZZ Civic Reporter', phone: '+910000000033' }).select('id').single();
  made.profiles.push(me.data.id);
  const mine1 = await report('water', SPOT.lat, SPOT.lng, { p_reporter: me.data.id });
  const mine2 = await report('water', SPOT.lat, SPOT.lng, { p_reporter: me.data.id });
  made.tickets.add(mine1.data?.id);
  made.tickets.add(mine2.data?.id);
  check('a retried report does not count the same citizen twice', mine2.data?.id === mine1.data?.id && mine2.data?.signatures === 1, `signatures=${mine2.data?.signatures}`);

  const RACE = { lat: HERE.lat + metres(4000), lng: HERE.lng };
  const both = await Promise.all([report('garbage', RACE.lat, RACE.lng), report('garbage', RACE.lat + metres(5), RACE.lng)]);
  both.forEach((r) => made.tickets.add(r.data?.id));
  const raced = await db.from('civic_tickets').select('id,signatures').eq('kind', 'garbage').gte('lat', RACE.lat - metres(50)).lte('lat', RACE.lat + metres(50));
  check('two phones reporting in the same instant make ONE ticket with two signatures', raced.data?.length === 1 && raced.data[0].signatures === 2, `${raced.data?.length} ticket(s), signatures=${raced.data?.map((x) => x.signatures).join('+')}`);
  raced.data?.forEach((x) => made.tickets.add(x.id));

  // ── storage ─────────────────────────────────────────────────────────────
  const bytes = new TextEncoder().encode('dikhado storage test');
  const pub = `civic-test/${Date.now().toString(36)}.txt`;
  const up = await db.storage.from('job-media').upload(pub, bytes, { contentType: 'text/plain' });
  if (!up.error) made.objects.push(['job-media', pub]);
  check('anon can upload to job-media', !up.error, up.error?.message);
  const url = db.storage.from('job-media').getPublicUrl(pub).data.publicUrl;
  const got = await fetch(url);
  check('job-media is publicly readable (workers see the photo)', got.status === 200 && (await got.text()) === 'dikhado storage test', `HTTP ${got.status}`);

  const secret = `civic-test/${Date.now().toString(36)}-id.txt`;
  const up2 = await db.storage.from('kyc').upload(secret, bytes, { contentType: 'text/plain' });
  if (!up2.error) made.objects.push(['kyc', secret]);
  check('anon can upload to kyc', !up2.error, up2.error?.message);
  const open = await fetch(db.storage.from('kyc').getPublicUrl(secret).data.publicUrl);
  check('kyc is NOT publicly readable', open.status !== 200, `HTTP ${open.status}`);
  const signed = await db.storage.from('kyc').createSignedUrl(secret, 60);
  const viaLink = signed.data ? await fetch(signed.data.signedUrl) : { status: 0 };
  check('the console can read kyc through a short-lived signed link', viaLink.status === 200, signed.error?.message ?? `HTTP ${viaLink.status}`);

  // ── verification trigger ────────────────────────────────────────────────
  const w = await db.from('profiles').insert({ role: 'worker', name: 'ZZ Civic Test Worker', phone: '+910000000031' }).select('id').single();
  made.profiles.push(w.data.id);
  await db.from('workers').insert({ profile_id: w.data.id, skills: ['appliance'] });
  const v = await db.from('verifications').insert({ worker_id: w.data.id, id_photo_url: secret, selfie_url: secret }).select('id').single();
  check('a worker can ask for the badge, selfie included', !v.error, v.error?.message);
  await db.from('verifications').update({ status: 'approved' }).eq('id', v.data.id);
  const badge = await db.from('workers').select('verified').eq('profile_id', w.data.id).single();
  check('approving on the console turns the badge on', badge.data?.verified === true);
  await db.from('verifications').update({ status: 'rejected' }).eq('id', v.data.id);
  const off = await db.from('workers').select('verified').eq('profile_id', w.data.id).single();
  check('rejecting turns it off again', off.data?.verified === false);
  const good = await db.from('verifications').insert({ worker_id: w.data.id, id_photo_url: secret }).select('id').single();
  const blurry = await db.from('verifications').insert({ worker_id: w.data.id, id_photo_url: secret }).select('id').single();
  await db.from('verifications').update({ status: 'approved' }).eq('id', good.data.id);
  await db.from('verifications').update({ status: 'rejected' }).eq('id', blurry.data.id);
  const kept = await db.from('workers').select('verified').eq('profile_id', w.data.id).single();
  check('rejecting a duplicate submission does not remove an approved badge', kept.data?.verified === true);

  // ── new job columns ─────────────────────────────────────────────────────
  const c = await db.from('profiles').insert({ role: 'customer', name: 'ZZ Civic Test Customer', phone: '+910000000032' }).select('id').single();
  made.profiles.push(c.data.id);
  const job = await db.from('requests').insert({ customer_id: c.data.id, worker_id: w.data.id, category_code: 'wiring_fault', lat: HERE.lat, lng: HERE.lng, transcript: 'स्विच बोर्ड से चिंगारी', urgent: true, vision_conf: 0.71 }).select('id,transcript,urgent').single();
  if (job.data) made.requests.push(job.data.id);
  check('a job carries what the customer said and its urgency', job.data?.urgent === true && job.data?.transcript?.includes('चिंगारी'), job.error?.message);
  const media = await db.from('requests').update({ photo_url: url, voice_url: url }).eq('id', job.data.id).select('photo_url').single();
  check('photo and voice links attach to the job after it is sent', media.data?.photo_url === url, media.error?.message);
} catch (e) {
  failures++;
  console.log(`FAIL  aborted: ${e.message}`);
} finally {
  for (const [bucket, path] of made.objects) await db.storage.from(bucket).remove([path]);
  if (made.requests.length) await db.from('requests').delete().in('id', made.requests);
  const ids = [...made.tickets].filter(Boolean);
  if (ids.length) await db.from('civic_tickets').delete().in('id', ids);
  if (made.profiles.length) await db.from('profiles').delete().in('id', made.profiles);
  const left = await db.from('civic_tickets').select('id').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  console.log(`cleanup: ${left.data?.length === 0 ? 'test rows and files removed' : 'SOME TEST ROWS REMAIN'}`);
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
