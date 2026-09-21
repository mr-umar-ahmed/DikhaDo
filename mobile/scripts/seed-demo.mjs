// Gives the console a believable morning before the demo starts: three finished, paid and rated jobs,
// and two panchayat reports - one fresh, one already past its deadline (so a red row exists).
// Safe to run twice: it recognises its own data and stops.
//   cd mobile && node scripts/seed-demo.mjs [lat,lng]        (defaults to HITEC City, Hyderabad)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const db = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });
const [lat, lng] = (process.argv[2] ?? '17.4474,78.3762').split(',').map(Number);
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const HISTORY = [
  { customer: ['Padma Reddy', '+919100000101'], worker: '+919000000001', category: 'fan_dead', price: 250, method: 'upi', stars: 5, tags: ['on_time', 'good_work'], said: 'ఫ్యాన్ తిరగడం లేదు' },
  { customer: ['Rafiq Ahmed', '+919100000102'], worker: '+919000000003', category: 'tap_leak', price: 180, method: 'cash', stars: 4, tags: ['fair_price'], said: 'नल से पानी टपक रहा है' },
  { customer: ['Sunitha K', '+919100000103'], worker: '+919000000009', category: 'bulk_waste', price: 200, method: 'cash', stars: 5, tags: ['on_time'], said: null },
];

const already = must(await db.from('profiles').select('id').eq('phone', HISTORY[0].customer[1]).limit(1), 'check');
if (already.length > 0) console.log('Finished jobs are already there.');

for (const [i, h] of already.length > 0 ? [] : HISTORY.entries()) {
  const customer = must(await db.from('profiles').insert({ role: 'customer', name: h.customer[0], phone: h.customer[1], lang: 'te' }).select('id').single(), 'customer');
  const worker = must(await db.from('profiles').select('id,name').eq('phone', h.worker).single(), 'seeded worker (run supabase/seed.sql first)');
  const base = { client_id: `seed-${i}`, customer_id: customer.id, worker_id: worker.id, category_code: h.category, lat: lat + (i - 1) * 0.006, lng: lng + (i - 1) * 0.004 };
  let made = await db.from('requests').insert({ ...base, transcript: h.said }).select('id,serial').single();
  if (made.error) made = await db.from('requests').insert(base).select('id,serial').single(); // database without migration 0004
  const job = must(made, 'job');
  // Walk the real state machine: the database refuses shortcuts, and the timeline should be complete.
  for (const [status, extra] of [['accepted', {}], ['on_the_way', {}], ['working', {}], ['done', { price_agreed: h.price }], ['paid', { pay_method: h.method }]]) {
    must(await db.from('requests').update({ status, ...extra }).eq('id', job.id), status);
  }
  must(await db.from('ratings').insert({ request_id: job.id, worker_id: worker.id, stars: h.stars, tags: h.tags }), 'rating');
  console.log(`${job.serial}  ${h.category}  ${worker.name}  ₹${h.price} ${h.method}  ${h.stars}★`);
}

// The two halves are independent: reports can be added later, once migration 0004 has been run.
const hoursAgo = (n) => new Date(Date.now() - n * 3600e3).toISOString();
const seededCivic = await db.from('civic_tickets').select('id').eq('note', 'Behind the bus stop, growing for a week').limit(1);
if (seededCivic.data?.length) {
  console.log('Panchayat reports are already there.');
  process.exit(0);
}
const civic = await db.from('civic_tickets').insert([
  { kind: 'garbage', department: 'Sanitation (Gram Panchayat / ULB ward office)', sla_hours: 12, severity: 3, lat: lat + 0.009, lng: lng - 0.007, note: 'Behind the bus stop, growing for a week', signatures: 7, created_at: hoursAgo(20), updated_at: hoursAgo(1) },
  { kind: 'streetlight', department: 'Street lighting', sla_hours: 48, severity: 2, lat: lat - 0.005, lng: lng + 0.008, note: 'Dark stretch near the school gate', signatures: 2, created_at: hoursAgo(5), updated_at: hoursAgo(5) },
]).select('serial,kind,signatures');
if (civic.error) console.log(`Panchayat reports skipped: ${civic.error.message}
Run supabase/migrations/0004_media_trust_civic.sql in the Supabase SQL editor, then run this script again.`);
else civic.data.forEach((t) => console.log(`${t.serial}  ${t.kind}  reported by ${t.signatures}`));
process.exit(0);
