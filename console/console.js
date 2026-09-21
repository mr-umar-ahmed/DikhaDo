/* DikhaDo Console. No build step: open index.html through any static server.
   Reads and writes the same Supabase project as the phones; realtime with a 5 s poll as the floor. */
(() => {
  const cfg = window.DIKHADO_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  if (!cfg || !cfg.url || !cfg.anonKey) {
    $('tab-jobs').innerHTML = '<p class="empty">No configuration. Copy <b>config.example.js</b> to <b>config.js</b> and fill in the Supabase URL and anon key.</p>';
    return;
  }
  const db = supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });

  // ── small helpers ─────────────────────────────────────────────────────────
  const toast = (text) => {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.hidden = true), 3500);
  };
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return `${Math.round(s)} s`;
    if (s < 5400) return `${Math.round(s / 60)} min`;
    if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
    return `${Math.round(s / 86400)} d`;
  };
  const clockLeft = (createdIso, slaHours) => {
    const left = new Date(createdIso).getTime() + slaHours * 3600e3 - Date.now();
    const h = Math.floor(Math.abs(left) / 3600e3);
    const m = Math.floor((Math.abs(left) % 3600e3) / 60e3);
    return { breached: left < 0, text: `${left < 0 ? 'late by ' : ''}${h} h ${String(m).padStart(2, '0')} min${left < 0 ? '' : ' left'}` };
  };
  // PostGIS geography arrives as hex EWKB. A point is: byte order, type (+SRID flag), [srid], x, y.
  const pointOf = (hex) => {
    if (!hex || typeof hex !== 'string' || hex.length < 42) return null;
    const bytes = new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));
    const view = new DataView(bytes.buffer);
    const le = view.getUint8(0) === 1;
    const hasSrid = (view.getUint32(1, le) & 0x20000000) !== 0;
    const at = hasSrid ? 9 : 5;
    return { lng: view.getFloat64(at, le), lat: view.getFloat64(at + 8, le) };
  };
  const STATUS = {
    requested: ['waiting for the worker', 'amber'], accepted: ['accepted', 'green'], on_the_way: ['on the way', 'green'],
    working: ['working', 'green'], done: ['done, to be paid', 'indigo'], paid: ['paid', 'green'], rated: ['rated', 'muted'],
    declined: ['declined', 'red'], cancelled: ['cancelled', 'muted'], disputed: ['disputed', 'red'],
  };
  const NEXT = { requested: ['accepted', 'Accept for the worker'], accepted: ['on_the_way', 'On the way'], on_the_way: ['working', 'Start work'], working: ['done', 'Work is done'] };

  // ── state ─────────────────────────────────────────────────────────────────
  const state = { jobs: [], workers: [], verifications: [], civic: [], civicReady: true, names: {} };

  async function load() {
    const since = new Date(Date.now() - 7 * 86400e3).toISOString();
    const [jobs, workers, ver, civic, cats] = await Promise.all([
      db.from('requests').select('*,worker:profiles!requests_worker_id_fkey(name,phone),customer:profiles!requests_customer_id_fkey(name,phone)').gte('created_at', since).order('created_at', { ascending: false }).limit(200),
      db.from('workers').select('*,profile:profiles!workers_profile_id_fkey(name,phone,village)').order('last_seen', { ascending: false, nullsFirst: false }),
      db.from('verifications').select('*,profile:profiles!verifications_worker_id_fkey(name,phone)').eq('status', 'pending').order('created_at'),
      // Once we know the table is missing (migration 0004 not run), stop asking every five seconds; a reload asks again.
      state.civicReady ? db.from('civic_tickets').select('*').order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [], error: { message: 'not migrated' } }),
      db.from('categories').select('code,name_en'),
    ]);
    if (jobs.error) return setConn(false, jobs.error.message);
    setConn(true);
    state.jobs = jobs.data ?? [];
    state.workers = workers.data ?? [];
    state.verifications = ver.data ?? [];
    state.civicReady = !civic.error;
    state.civic = civic.data ?? [];
    (cats.data ?? []).forEach((c) => (state.names[c.code] = c.name_en));
    render();
  }

  function setConn(ok, why) {
    const el = $('conn');
    el.textContent = ok ? 'live' : 'offline';
    el.className = `stamp ${ok ? 'stamp-green' : 'stamp-red'}`;
    if (!ok && why) toast(`Could not reach the database: ${why}`);
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  function render() {
    renderStats();
    renderJobs();
    renderVerify();
    renderWorkers();
    renderCivic();
    renderMap();
  }

  function renderStats() {
    const today = new Date().toDateString();
    const todays = state.jobs.filter((j) => new Date(j.created_at).toDateString() === today);
    const finished = todays.filter((j) => ['paid', 'rated'].includes(j.status));
    const earned = finished.reduce((s, j) => s + (j.price_agreed || 0), 0);
    const onDuty = state.workers.filter((w) => w.on_duty && w.last_seen && Date.now() - new Date(w.last_seen).getTime() < 600e3).length;
    const late = state.civic.filter((t) => !['verified_fixed'].includes(t.status) && clockLeft(t.created_at, t.sla_hours).breached).length;
    $('stats').innerHTML = [
      [onDuty, 'workers on duty now'], [todays.length, 'jobs today'], [finished.length, 'finished and paid today'],
      [`₹${earned.toLocaleString('en-IN')}`, 'earned by workers today'], [state.civic.filter((t) => t.status !== 'verified_fixed').length, 'open panchayat reports'], [late, 'reports past their deadline'],
    ].map(([n, label]) => `<div class="stat"><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join('');
  }

  function renderJobs() {
    const live = state.jobs.filter((j) => !['rated', 'cancelled', 'declined'].includes(j.status));
    $('n-jobs').textContent = live.length;
    $('tab-jobs').innerHTML = state.jobs.length === 0 ? '<p class="empty">No jobs in the last seven days. When a customer requests a worker, the job appears here at once.</p>' :
      state.jobs.map((j) => {
        const [label, tone] = STATUS[j.status] ?? [j.status, 'muted'];
        const next = NEXT[j.status];
        return `<div class="row ${j.status === 'requested' ? 'fresh' : ''}">
          <div>
            <h3>${esc(state.names[j.category_code] ?? j.category_code)} ${j.urgent ? '<span class="stamp stamp-red">urgent</span>' : ''}</h3>
            <p><span class="mono">${esc(j.serial)}</span>, ${esc(ago(j.created_at))} ago</p>
            <p>${esc(j.customer?.name ?? 'customer')} asked ${esc(j.worker?.name ?? 'a worker')}${j.price_agreed ? `, ₹${esc(j.price_agreed)}${j.pay_method ? ' by ' + esc(j.pay_method) : ''}` : ''}</p>
            ${j.transcript ? `<p>Customer said: “${esc(j.transcript)}”</p>` : ''}
            ${j.proof_verdict ? `<p>Proof of Work: <b>${esc(j.proof_verdict.replace('_', ' '))}</b></p>` : ''}
            ${j.photo_url ? `<img class="thumb" alt="Photo sent by the customer" src="${esc(j.photo_url)}">` : ''}
            ${j.voice_url ? `<p><audio controls preload="none" src="${esc(j.voice_url)}"></audio></p>` : ''}
          </div>
          <div class="side">
            <span class="stamp stamp-${tone}">${esc(label)}</span>
            <div class="actions">${next ? `<button class="btn ${j.status === 'requested' ? 'btn-go' : ''}" data-move="${esc(j.id)}" data-from="${esc(j.status)}" data-to="${next[0]}">${esc(next[1])}</button>` : ''}</div>
          </div>
        </div>`;
      }).join('');
  }

  function renderVerify() {
    $('n-verify').textContent = state.verifications.length;
    $('tab-verify').innerHTML = state.verifications.length === 0 ? '<p class="empty">Nobody is waiting. When a worker sends their ID from the app, it appears here to approve.</p>' :
      state.verifications.map((v) => `<div class="row fresh">
        <div><h3>${esc(v.profile?.name ?? 'Worker')}</h3><p>${esc(v.profile?.phone ?? '')}, sent ${esc(ago(v.created_at))} ago</p>
          <div id="kyc-${esc(v.id)}"></div></div>
        <div class="side"><div class="actions">
          <button class="btn" data-kyc="${esc(v.id)}">Show documents</button>
          <button class="btn btn-go" data-verify="${esc(v.id)}" data-decision="approved">Approve</button>
          <button class="btn btn-warn" data-verify="${esc(v.id)}" data-decision="rejected">Reject</button>
        </div></div></div>`).join('');
  }

  function renderWorkers() {
    $('n-workers').textContent = state.workers.length;
    $('tab-workers').innerHTML = state.workers.map((w) => {
      const fresh = w.on_duty && w.last_seen && Date.now() - new Date(w.last_seen).getTime() < 600e3;
      return `<div class="row">
        <div><h3>${esc(w.profile?.name ?? 'Worker')} ${w.verified ? '<span class="stamp stamp-green">verified</span>' : ''}</h3>
          <p>${esc((w.skills ?? []).map((s) => state.names[s] ?? s).join(', '))}</p>
          <p>${w.rating_count ? `${Number(w.rating_avg).toFixed(1)} from ${esc(w.rating_count)} ratings` : 'no ratings yet'}, ${esc(w.jobs_done)} jobs, ${esc(w.tier)}${w.profile?.village ? ', ' + esc(w.profile.village) : ''}</p></div>
        <div class="side"><span class="stamp ${fresh ? 'stamp-green' : 'stamp-muted'}">${fresh ? 'on duty' : 'off duty'}</span>
          <div class="actions"><button class="btn" data-badge="${esc(w.profile_id)}" data-on="${w.verified ? '0' : '1'}">${w.verified ? 'Remove verified badge' : 'Mark verified'}</button></div></div>
      </div>`;
    }).join('') || '<p class="empty">No workers yet.</p>';
  }

  function renderCivic() {
    const open = state.civic.filter((t) => t.status !== 'verified_fixed');
    $('n-civic').textContent = open.length;
    if (!state.civicReady) return ($('tab-civic').innerHTML = '<p class="empty">Panchayat reports need database migration <b>0004_media_trust_civic.sql</b>. Run it in the Supabase SQL editor, then reload.</p>');
    $('tab-civic').innerHTML = state.civic.length === 0 ? '<p class="empty">No reports yet. When a citizen photographs a garbage heap or an open drain, it lands here with its deadline running.</p>' :
      state.civic.map((t) => {
        const c = clockLeft(t.created_at, t.sla_hours);
        const closed = t.status === 'verified_fixed';
        const tone = { open: 'indigo', reopened: 'red', resolved_claimed: 'amber', verified_fixed: 'green' }[t.status];
        const label = { open: 'open', reopened: 'reopened: closure was false', resolved_claimed: 'marked resolved, not yet verified', verified_fixed: 'verified fixed by a citizen' }[t.status];
        return `<div class="row ${!closed && c.breached ? 'breach' : ''}">
          <div><h3>${esc(t.kind)} <span class="muted">to ${esc(t.department)}</span></h3>
            <p><span class="mono">${esc(t.serial)}</span>, severity ${esc(t.severity)} of 5, reported by <b>${esc(t.signatures)}</b> ${t.signatures === 1 ? 'citizen' : 'citizens'}</p>
            <p class="mono">${esc(t.lat.toFixed(5))}, ${esc(t.lng.toFixed(5))}</p>
            ${t.note ? `<p>“${esc(t.note)}”</p>` : ''}
            ${t.photo_url ? `<img class="thumb" alt="Photo of the reported problem" src="${esc(t.photo_url)}">` : ''}</div>
          <div class="side"><span class="stamp stamp-${tone}">${esc(label)}</span>
            ${closed ? '' : `<span class="mono" style="color:${c.breached ? 'var(--red)' : 'inherit'}">${esc(c.text)}</span>`}
            <div class="actions">${['open', 'reopened'].includes(t.status) ? `<button class="btn" data-resolve="${esc(t.id)}">Mark resolved</button>` : ''}</div></div>
        </div>`;
      }).join('');
  }

  // ── map ───────────────────────────────────────────────────────────────────
  let map;
  let markers = [];
  let framed = false;
  function renderMap() {
    if (!map) {
      map = new maplibregl.Map({
        container: 'map',
        style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] },
        center: [78.3762, 17.4474], zoom: 12,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      // The panel gets its final height after fonts and the sticky layout settle; keep the canvas in step.
      new ResizeObserver(() => map.resize()).observe($('map'));
    }
    markers.forEach((m) => m.remove());
    markers = [];
    const bounds = new maplibregl.LngLatBounds();
    const pin = (lng, lat, color, html) => {
      const el = document.createElement('div');
      el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)`;
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(html)).addTo(map));
      bounds.extend([lng, lat]);
    };
    state.workers.forEach((w) => {
      const p = pointOf(w.geog);
      const fresh = w.on_duty && w.last_seen && Date.now() - new Date(w.last_seen).getTime() < 600e3;
      if (p && fresh) pin(p.lng, p.lat, '#2F6B4F', `<b>${esc(w.profile?.name)}</b><br>${esc((w.skills ?? []).join(', '))}${w.verified ? '<br>verified' : ''}`);
    });
    state.jobs.filter((j) => j.lat != null && !['rated', 'cancelled', 'declined', 'paid'].includes(j.status)).forEach((j) =>
      pin(j.lng, j.lat, '#C77A16', `<b>${esc(state.names[j.category_code] ?? j.category_code)}</b><br><span class="mono">${esc(j.serial)}</span><br>${esc((STATUS[j.status] ?? [j.status])[0])}`));
    state.civic.filter((t) => t.status !== 'verified_fixed').forEach((t) => {
      const c = clockLeft(t.created_at, t.sla_hours);
      pin(t.lng, t.lat, c.breached ? '#A82A22' : '#2C3E8F', `<b>${esc(t.kind)}</b>, ${esc(t.signatures)} reports<br><span class="mono">${esc(t.serial)}</span><br>${esc(c.text)}`);
    });
    if (!framed && !bounds.isEmpty()) {
      framed = true; // frame once; after that the operator's own pan and zoom are respected
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;

    if (b.dataset.tab) {
      document.querySelectorAll('.tabs button').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
      document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== `tab-${b.dataset.tab}`));
      return;
    }
    b.disabled = true;
    try {
      if (b.dataset.move) {
        const extra = {};
        if (b.dataset.to === 'done') {
          const rupees = parseInt(prompt('Amount the worker charged, in rupees:') ?? '', 10);
          if (!rupees || rupees <= 0) return toast('Enter the amount charged to finish the job.');
          extra.price_agreed = rupees;
        }
        // Guarded exactly like the phones: only from the status shown on this screen.
        const { data, error } = await db.from('requests').update({ status: b.dataset.to, ...extra }).eq('id', b.dataset.move).eq('status', b.dataset.from).select('id');
        if (error) toast(`That move was refused: ${error.message}`);
        else if (!data.length) toast('This job changed on a phone a moment ago. The list has been refreshed.');
      } else if (b.dataset.badge) {
        const { error } = await db.from('workers').update({ verified: b.dataset.on === '1' }).eq('profile_id', b.dataset.badge);
        if (error) toast(error.message);
      } else if (b.dataset.verify) {
        const { error } = await db.from('verifications').update({ status: b.dataset.decision }).eq('id', b.dataset.verify);
        toast(error ? error.message : b.dataset.decision === 'approved' ? 'Approved. The Verified badge is now live on customers’ phones.' : 'Rejected.');
      } else if (b.dataset.kyc) {
        const v = state.verifications.find((x) => x.id === b.dataset.kyc);
        const links = await Promise.all([v?.id_photo_url, v?.selfie_url].filter(Boolean).map((path) => db.storage.from('kyc').createSignedUrl(path, 300)));
        $(`kyc-${b.dataset.kyc}`).innerHTML = links.filter((l) => l.data).map((l) => `<img class="thumb" style="width:140px;height:140px" alt="Document sent by the worker" src="${esc(l.data.signedUrl)}">`).join(' ') || '<p>No documents were attached.</p>';
      } else if (b.dataset.resolve) {
        const { error } = await db.from('civic_tickets').update({ status: 'resolved_claimed', updated_at: new Date().toISOString() }).eq('id', b.dataset.resolve);
        if (!error) await db.from('civic_events').insert({ ticket_id: b.dataset.resolve, what: 'resolved_claimed', by_whom: 'department console' });
        toast(error ? error.message : 'Marked resolved. It stays open to the public until a citizen’s re-scan confirms it.');
      }
    } finally {
      b.disabled = false;
      load();
    }
  });

  // ── live ──────────────────────────────────────────────────────────────────
  db.channel(`console-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'verifications' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'civic_tickets' }, load)
    .subscribe();
  setInterval(load, 5000); // the floor, for networks that block websockets
  setInterval(() => ($('clock').textContent = new Date().toLocaleTimeString('en-IN', { hour12: false })), 1000);
  load();
})();
