// Backend smoke test: runs one full job through the live Supabase project and checks every
// trigger, the matching function and realtime delivery. Creates throwaway people and removes them.
//   cd mobile && node scripts/lifecycle-test.mjs
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

const HERE = { lat: 17.4474, lng: 78.3762 };
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// Realtime: resolve when an event for this job with this status arrives, or null after the timeout.
const waiters = [];
const waitFor = (status, ms = 6000) =>
  new Promise((resolve) => {
    const started = Date.now();
    const timer = setTimeout(() => resolve(null), ms);
    waiters.push({ status, done: () => (clearTimeout(timer), resolve(Date.now() - started)) });
  });

const created = { profiles: [], requests: [] };

try {
  // ── People ──────────────────────────────────────────────────────────────
  const customer = must(await db.from('profiles').insert({ role: 'customer', name: 'ZZ Test Customer', phone: '+910000000001', lang: 'te' }).select('id').single(), 'customer');
  const worker = must(await db.from('profiles').insert({ role: 'worker', name: 'ZZ Test Worker', phone: '+910000000002', lang: 'te' }).select('id').single(), 'worker profile');
  created.profiles.push(customer.id, worker.id);
  must(await db.from('workers').insert({ profile_id: worker.id, skills: ['appliance'], languages: ['te'], upi_id: 'test@upi' }), 'worker row');

  // ── Presence + matching ─────────────────────────────────────────────────
  must(await db.rpc('worker_heartbeat', { p_profile: worker.id, p_lat: HERE.lat, p_lng: HERE.lng, p_on_duty: true }), 'heartbeat on');
  let near = must(await db.rpc('nearby_workers', { p_lat: HERE.lat, p_lng: HERE.lng, p_category: 'fan_dead', p_lang: 'te' }), 'nearby');
  const mine = near.find((w) => w.profile_id === worker.id);
  check('on-duty worker is matched for a sub-problem of their skill', !!mine, `${near.length} workers returned`);
  check('match carries the rate card', mine?.min_inr === 150 && mine?.max_inr === 300, `₹${mine?.min_inr}–${mine?.max_inr}`);
  check('distance is ~0 m', mine && mine.distance_m < 5, `${mine?.distance_m?.toFixed(1)} m`);
  near = must(await db.rpc('nearby_workers', { p_lat: HERE.lat, p_lng: HERE.lng, p_category: 'tap_leak', p_lang: 'te' }), 'nearby other skill');
  check('worker is NOT matched for a skill they lack', !near.some((w) => w.profile_id === worker.id));

  // ── Realtime subscription (what the worker phone does) ──────────────────
  const subscribed = await new Promise((resolve) => {
    db.channel(`inbox-${worker.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `worker_id=eq.${worker.id}` }, (p) => {
        const i = waiters.findIndex((w) => w.status === p.new?.status);
        if (i >= 0) waiters.splice(i, 1)[0].done();
      })
      .subscribe((s) => (s === 'SUBSCRIBED' ? resolve(true) : ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s) && resolve(false)));
    setTimeout(() => resolve(false), 10000);
  });
  check('realtime channel subscribes', subscribed);
  // Supabase reports SUBSCRIBED slightly before its database listener is attached; a worker's phone
  // subscribes long before a job arrives, so give the channel the same head start here.
  await new Promise((r) => setTimeout(r, Number(process.env.SETTLE_MS ?? 3000)));

  // ── The job ─────────────────────────────────────────────────────────────
  const clientId = `${customer.id}.smoke`;
  let arrival = waitFor('requested');
  const job = must(await db.from('requests').insert({ client_id: clientId, customer_id: customer.id, worker_id: worker.id, category_code: 'fan_dead', lat: HERE.lat, lng: HERE.lng })
    .select('*,worker:profiles!requests_worker_id_fkey(name,phone),customer:profiles!requests_customer_id_fkey(name,phone)').single(), 'create job');
  created.requests.push(job.id);
  check('serial is minted', /^DKD-\d{4}-\d{6}$/.test(job.serial), job.serial);
  check('starts as requested', job.status === 'requested');
  check('both parties embed', job.worker?.name === 'ZZ Test Worker' && job.customer?.name === 'ZZ Test Customer');
  check('geog is derived from lat/lng', job.geog != null);
  let ms = await arrival;
  check('worker phone hears the new request over realtime', ms !== null, ms === null ? 'no event in 6 s' : `${ms} ms`);

  const dup = await db.from('requests').insert({ client_id: clientId, customer_id: customer.id, worker_id: worker.id, category_code: 'fan_dead' });
  check('a retried insert with the same client_id is rejected', dup.error?.code === '23505', dup.error?.code ?? 'no error');

  // ── Guards (migration 0003) ─────────────────────────────────────────────
  const skip = await db.from('requests').update({ status: 'working' }).eq('id', job.id).eq('status', 'accepted').select('id');
  check('a move from the wrong starting status matches no row (stale phone)', !skip.error && skip.data.length === 0);
  const jump = await db.from('requests').update({ status: 'paid', pay_method: 'cash' }).eq('id', job.id);
  check('database refuses an illegal jump (requested -> paid)', jump.error?.code === 'P0001', jump.error?.message ?? 'no error');
  const early = await db.from('ratings').insert({ request_id: job.id, worker_id: worker.id, stars: 5 });
  check('a job cannot be rated before it is paid', !!early.error, early.error?.message ?? 'no error');

  const latencies = [];
  for (const [status, extra] of [['accepted', {}], ['on_the_way', {}], ['working', {}], ['done', { price_agreed: 250 }], ['paid', { pay_method: 'upi' }]]) {
    if (status === 'done') {
      const free = await db.from('requests').update({ status: 'done' }).eq('id', job.id);
      check('work cannot be marked done without an amount', free.error?.code === 'P0001', free.error?.message ?? 'no error');
    }
    arrival = waitFor(status);
    must(await db.from('requests').update({ status, ...extra }).eq('id', job.id), `-> ${status}`);
    ms = await arrival;
    if (ms !== null) latencies.push(ms);
    check(`-> ${status} reaches subscribers`, ms !== null, ms === null ? 'no event in 6 s' : `${ms} ms`);
  }
  if (latencies.length) console.log(`      realtime latency: median ${latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)]} ms, worst ${Math.max(...latencies)} ms`);

  const counted = must(await db.from('workers').select('jobs_done').eq('profile_id', worker.id).single(), 'jobs after paid');
  check('the job counts for the worker once paid, before any rating', counted.jobs_done === 1, `jobs_done=${counted.jobs_done}`);

  const bad = await db.from('requests').update({ status: 'teleported' }).eq('id', job.id);
  check('an unknown status is rejected by the database', !!bad.error);

  // ── Rating → reputation ─────────────────────────────────────────────────
  must(await db.from('ratings').insert({ request_id: job.id, worker_id: worker.id, stars: 5, tags: ['on_time', 'good_work'] }), 'rate');
  const after = must(await db.from('requests').select('status,price_agreed,pay_method,updated_at,created_at').eq('id', job.id).single(), 'reload job');
  check('rating marks the job rated', after.status === 'rated');
  check('price and pay method persisted', after.price_agreed === 250 && after.pay_method === 'upi');
  const rep = must(await db.from('workers').select('rating_avg,rating_count,jobs_done,tier').eq('profile_id', worker.id).single(), 'reload worker');
  check('reputation updated by trigger', Number(rep.rating_avg) === 5 && rep.rating_count === 1 && rep.jobs_done === 1 && rep.tier === 'new', JSON.stringify(rep));
  const twice = await db.from('ratings').insert({ request_id: job.id, worker_id: worker.id, stars: 1 });
  check('a job cannot be rated twice', !!twice.error);

  const events = must(await db.from('request_events').select('status').eq('request_id', job.id).order('id'), 'events');
  const trail = events.map((e) => e.status).join(' > ');
  check('timeline is complete and ordered', trail === 'requested > accepted > on_the_way > working > done > paid > rated', trail);

  // ── Decline path + going off duty ───────────────────────────────────────
  const job2 = must(await db.from('requests').insert({ customer_id: customer.id, worker_id: worker.id, category_code: 'appliance', lat: HERE.lat, lng: HERE.lng }).select('id,serial').single(), 'second job');
  created.requests.push(job2.id);
  check('serials increase', job2.serial > job.serial, `${job.serial} then ${job2.serial}`);
  must(await db.from('requests').update({ status: 'declined' }).eq('id', job2.id), 'decline');
  const revive = await db.from('requests').update({ status: 'accepted' }).eq('id', job2.id);
  check('a declined job cannot be revived by a late Accept', revive.error?.code === 'P0001', revive.error?.message ?? 'no error');
  const inbox = must(await db.from('requests').select('id').eq('worker_id', worker.id).in('status', ['requested', 'accepted', 'on_the_way', 'working', 'done']), 'inbox');
  check('finished and declined jobs leave the worker inbox', inbox.length === 0, `${inbox.length} left`);

  const ghost = await db.rpc('worker_heartbeat', { p_profile: '00000000-0000-0000-0000-000000000000', p_lat: HERE.lat, p_lng: HERE.lng, p_on_duty: true });
  check('heartbeat reports a worker that no longer exists', ghost.data === false, `returned ${JSON.stringify(ghost.data)}`);
  const off = await db.rpc('worker_heartbeat', { p_profile: worker.id, p_lat: HERE.lat, p_lng: HERE.lng, p_on_duty: false });
  check('heartbeat confirms a worker that does exist', off.data === true && !off.error, `returned ${JSON.stringify(off.data)}`);
  near = must(await db.rpc('nearby_workers', { p_lat: HERE.lat, p_lng: HERE.lng, p_category: 'fan_dead', p_lang: 'te' }), 'nearby after off duty');
  check('off-duty worker disappears from matching', !near.some((w) => w.profile_id === worker.id));
} catch (e) {
  failures++;
  console.log(`FAIL  aborted: ${e.message}`);
} finally {
  // Remove only what this run created.
  if (created.requests.length) await db.from('requests').delete().in('id', created.requests);
  if (created.profiles.length) await db.from('profiles').delete().in('id', created.profiles);
  const left = await db.from('profiles').select('id').in('id', created.profiles.length ? created.profiles : ['00000000-0000-0000-0000-000000000000']);
  console.log(`cleanup: ${left.data?.length === 0 ? 'test rows removed' : 'SOME TEST ROWS REMAIN'}`);
  await db.removeAllChannels();
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}
