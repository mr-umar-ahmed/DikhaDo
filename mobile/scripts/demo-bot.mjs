// Plays the 12 seeded demo workers from the laptop, so one phone is enough to run the whole loop
// and a request to "Ramesh" is never left unanswered on stage.
//
//   cd mobile && node scripts/demo-bot.mjs                  answer requests to seeded workers
//   node scripts/demo-bot.mjs --here 17.4474,78.3762        first move the seeded workers to this spot
//   node scripts/demo-bot.mjs --fast                        1 s between steps instead of 3-6 s
//
// It only ever touches jobs addressed to seeded workers (+9190000000xx). Ctrl+C to stop.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const db = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const here = args.includes('--here') ? args[args.indexOf('--here') + 1] : null;
const wait = (s) => new Promise((r) => setTimeout(r, (fast ? 1 : s) * 1000));
const stamp = () => new Date().toLocaleTimeString('en-IN', { hour12: false });
const say = (serial, text) => console.log(`${stamp()}  ${serial ?? '            '}  ${text}`);

if (here) {
  const [lat, lng] = here.split(',').map(Number);
  const { data, error } = await db.rpc('move_demo_workers', { p_lat: lat, p_lng: lng });
  if (error) throw new Error(`move_demo_workers: ${error.message}`);
  say(null, `moved ${data} seeded workers to ${lat}, ${lng}`);
}

const { data: seeded, error: seedError } = await db.from('profiles').select('id,name').eq('role', 'worker').like('phone', '+9190000000__');
if (seedError) throw new Error(seedError.message);
const names = new Map(seeded.map((p) => [p.id, p.name]));
if (names.size === 0) throw new Error('no seeded workers found - run supabase/seed.sql first');
say(null, `answering for ${names.size} seeded workers: ${[...names.values()].slice(0, 4).join(', ')}, ...`);

const { data: cards } = await db.from('rate_cards').select('category_code,min_inr,max_inr');
const price = (code) => {
  const c = cards?.find((r) => r.category_code === code);
  return c ? Math.round((c.min_inr + c.max_inr) / 2 / 10) * 10 : 200;
};

// A guarded move, exactly as the app does it: only from the status we last saw.
async function move(job, from, to, extra = {}) {
  const { data, error } = await db.from('requests').update({ status: to, ...extra }).eq('id', job.id).eq('status', from).select('id');
  if (error) return say(job.serial, `could not move to ${to}: ${error.message}`), false;
  if (!data?.length) return say(job.serial, `was no longer "${from}" (customer cancelled?) - leaving it`), false;
  say(job.serial, `${names.get(job.worker_id)}: ${to}${extra.price_agreed ? ` (₹${extra.price_agreed})` : ''}`);
  return true;
}

const handling = new Set();
async function serve(job) {
  if (handling.has(job.id)) return;
  handling.add(job.id);
  const t0 = Date.now();
  say(job.serial, `new request for ${names.get(job.worker_id)} (${job.category_code})`);
  await wait(3);
  if (!(await move(job, 'requested', 'accepted'))) return;
  await wait(4);
  if (!(await move(job, 'accepted', 'on_the_way'))) return;
  await wait(5);
  if (!(await move(job, 'on_the_way', 'working'))) return;
  await wait(6);
  if (!(await move(job, 'working', 'done', { price_agreed: price(job.category_code) }))) return;
  say(job.serial, `worker side finished in ${((Date.now() - t0) / 1000).toFixed(1)} s - waiting for the customer to pay and rate`);
  watching.set(job.id, { serial: job.serial, created: new Date(job.created_at).getTime(), last: 'done' });
}

// After "done" the phone takes over; report when the customer pays and rates, with the full loop time.
const watching = new Map();
async function sweep() {
  const ids = [...names.keys()];
  const { data: fresh } = await db.from('requests').select('id,serial,worker_id,category_code,status,created_at').in('worker_id', ids).eq('status', 'requested');
  fresh?.forEach(serve);
  if (watching.size === 0) return;
  const { data: later } = await db.from('requests').select('id,status,pay_method,updated_at').in('id', [...watching.keys()]);
  later?.forEach((j) => {
    const w = watching.get(j.id);
    if (!w || j.status === w.last) return;
    w.last = j.status;
    const total = ((new Date(j.updated_at).getTime() - w.created) / 1000).toFixed(1);
    if (j.status === 'paid') say(w.serial, `customer paid by ${j.pay_method}`);
    if (j.status === 'rated') {
      say(w.serial, `customer rated - FULL LOOP request -> rated in ${total} s`);
      watching.delete(j.id);
    }
  });
}

db.channel(`bot-${Date.now()}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, sweep)
  .subscribe();
setInterval(sweep, 2000); // floor, for networks that block websockets
sweep();
say(null, 'ready. On the phone: request any seeded worker. Ctrl+C to stop.');
