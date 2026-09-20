# DikhaDo — Implementation Plan (v2, marketplace-first)

*Dikha do. Theek ho jayega.* — "Just show it. It'll get fixed."

Working name **DikhaDo** (see §1). Supersedes the v1 "Theek" civic-first plan. Written 20 Sep 2026 for iQOO City Battles Hyderabad, 26–27 Sep 2026 (30-hour build).

## 0. What changed

| | v1 Theek | v2 DikhaDo |
|---|---|---|
| Primary problem | civic grievance reporting | **finding a trusted nearby worker in rural / small-town India** |
| Civic reporting, Proof of Fix, paper record | the product | **toppings** on the same camera |
| Network | strictly airplane-mode | internet allowed, **low-bandwidth tolerant**, no paid APIs |
| AI | vision + ASR + 2B LLM on device | **one tiny on-device vision model (~3 MB)**; app fully usable with AI off |
| Stack | Kotlin + Compose | **Expo (React Native, TypeScript) + Supabase** |

Dropping the on-device LLM and offline ASR removes the two biggest risks of v1 (Gemma speed, missing Telugu speech packs). The voice feature survives as a **recorded voice note** attached to the job — zero AI, zero literacy needed, works on any phone.

## 1. Name

Every obvious word is already a live app in this exact category — checked: **KaamSetu, Haazir, Kushal, KaamAdda, Mazdoor Sytu** are all on Play Store. So the name should come from what only we do: you don't type, you don't browse menus, you **show** the problem to the phone.

- **DikhaDo** (दिखा दो, "just show it") — recommended. Names the gesture, works as a verb ("DikhaDo kar do"), keeps *theek* alive in the tagline.
- Alternates: **Mestri** (మేస్త్రీ / मिस्त्री — the one word for "skilled tradesman" understood from UP to Tamil Nadu), **Dastak** (दस्तक, "a knock at your door").

Not trademark-cleared — fine for a hackathon, re-check before any launch. Package id: `in.dikhado.app`.

## 2. Competitor research → what we take, what we beat

| App | What it does well (we include) | Gap we exploit |
|---|---|---|
| **KaamAdda** | category + location search; one-tap **call / WhatsApp**; "post work"; 9 Indian languages | static directory — no live availability, no price, no job lifecycle |
| **Mazdoor Sytu** | **live map** of nearby workers with realtime markers + distance; phone-OTP verification; apply → shortlist → hire flow; in-app chat; push; "top rated"; **agriculture categories** (tractor, harvest labour) | job-board model (slow); Hindi/English only; Google Maps dependency |
| **Deelo** | worker sees **job details + payout before accepting**; ID check → **trust badge**; one reputation across services; earnings wallet; WhatsApp comms | Kerala-urban, delivery-centric |
| **Kaamate** | *not found on the web under any spelling — send me a link and I'll fold it in* | — |
| Urban Company (reference) | fixed rate cards, job timeline | metro-only, smartphone-literate users |

**Nobody does:** photo → diagnosis → matched worker. Nobody shows a **price range before the call**. Nobody handles a user who can't read a category tree. That is our wedge.

## 3. Product

### Roles (one app, chosen at first launch, switchable)
**Customer** · **Worker** · **Sahayak** (CSC operator / village helper who registers workers and books on behalf of others — a mode, not a separate app).

### Core loop (Tier 1 — the demo)
1. **Show it.** Open app → camera. Snap the broken fan. On-device model → `Electrical › Fan › likely capacitor / winding`. *Or* tap the big icon grid (no-AI path, identical result).
2. **Say it (optional).** Hold to record an 8-second voice note in any language. Attached to the job as audio.
3. **See who's here.** Workers who are **on duty right now** within radius: photo, verified badge, rating, jobs done, languages, distance/ETA, **price range from the rate card** (₹150–₹300).
4. **Request or just call.** "Request Ramesh" → he gets the job card (photo + diagnosis + voice note + distance + price range) → Accept / Decline. Or one-tap **Call** / **WhatsApp** — always available, because that is how Bharat actually books.
5. **Track.** Requested → Accepted → On the way ("call before coming" honoured) → Working → Done.
6. **Pay.** Cash, or **UPI intent** (`upi://pay?pa=…` opens PhonePe/GPay/Paytm — free, no gateway, no API).
7. **Rate.** Stars + 3 tap-tags (on time / fair price / good work). Feeds the worker's tier.

### Worker side
Profile (skills, languages, village/pincode, rate card, UPI id) · **On duty / Off duty** toggle with location heartbeat · incoming job card with everything visible *before* accepting · today's jobs + earnings ledger · reputation tier (New → Trusted → Star) that raises match ranking.

### No-AI / low-spec mode (first-class, not a fallback)
Auto-enabled when `isLowRamDevice`, RAM < 3 GB, model load fails, or user toggles "Simple mode". Icon grid replaces the camera-first screen; list replaces the map; images load as thumbnails only. Every feature still works — AI only saves taps.

### Service catalog — rows in a table, never screens
Electrical (fan, wiring, switchboard, inverter) · Plumbing (tap, pipe, tank, motor line) · **Pump / tubewell / motor** · Appliance (geyser, cooler, fridge, mixer, TV) · Carpentry · Mason / painting · **2-wheeler / tractor mechanic** · **Garbage & bulk-waste pickup** · Farm labour / tractor hire · Cleaning / tank cleaning. Adding a service = one row in `categories` + rate card rows.

### Toppings (everything v1 built toward, now as extras)
- **Report to panchayat.** Same camera: if the model sees a garbage dump, open drain, pothole or dead streetlight on public land, the sheet offers "Report to panchayat" → the v1 paper grievance record with serial, SLA and department from the routing table → web console map.
- **Proof of Fix → Proof of Work.** Before/after photo with ghost-overlay alignment; on-device re-classification gives `fixed / still broken / unclear`. Protects the customer from a bad job *and* the worker from a false complaint. Dispute evidence for the Sahayak.
- **Paper job card.** The form-paper receipt with monospace serial — shareable as an image over WhatsApp. A worker's first-ever formal invoice.
- **Offline queue.** A request composed with no signal is stored locally and sent when one bar returns (text first ~2 KB, photo later, compressed).
- **Collective weight** for civic tickets (duplicates add signatures).

### Vision slide only — do not build
IVR, UPI 123PAY feature-phone flow, WhatsApp chatbot booking, worker insurance / tools / training, subscriptions & platform-fee billing, full KYC with DigiLocker. Revenue model (₹10–30/job or ₹99–299/month) lives in the pitch.

## 4. Tech stack — chosen for build speed, ₹0 cost, no paid APIs

| Layer | Choice | Why |
|---|---|---|
| App | **Expo SDK (React Native) + TypeScript, expo-router**, dev-client build | Node is already on this machine, Flutter is not (1 GB+ SDK install); one language across app, console and backend types; fastest iteration (hot reload over USB/Wi-Fi) |
| UI | StyleSheet + design tokens, Reanimated 3, expo-haptics, bundled IBM Plex / Noto fonts | carries over the v1 design system exactly |
| Camera + AI | **react-native-vision-camera + react-native-fast-tflite**, MobileNetV3-Small INT8 (~3 MB), GPU/NNAPI delegate | genuinely on-device, <100 ms, no API |
| Backend | **Supabase free tier**: Postgres + **PostGIS** (nearest-worker query), **Realtime** (presence, job status), Storage (photos, voice notes), RLS | one service, no servers to write |
| Maps | **MapLibre + OpenStreetMap tiles** | no Google Maps key, no billing |
| Local data | expo-sqlite (offline queue, cached workers, rate cards) | works on one bar |
| Voice note | expo-audio (AAC 16 kbps ≈ 16 KB for 8 s) | no ASR needed |
| Phone integration | `tel:`, `https://wa.me/…`, `upi://pay`, share-sheet, expo-location, expo-notifications | the "creative phone use" 15% |
| i18n | i18next — **English, Hindi, Telugu** at launch, language picked on first screen with audio label | local-language-first |
| Console | Next.js + Tailwind + MapLibre + Supabase realtime | verification queue, live job map, civic tickets |

Honest trade-off: Flutter produces a slightly lighter app on ₹6k phones. Mitigation: Hermes, arm64 + armv7 only, no heavy UI kit, thumbnails, target APK ≤ 35 MB, tested on the lowest-spec phone we can find.

Auth caveat: real SMS OTP costs money on every provider. Hackathon build uses Supabase anonymous auth + phone number captured on profile, with a working OTP screen wired to Supabase test numbers. Flagged, not hidden.

## 5. Data model (Supabase)

```
profiles(id, role, name, phone, lang, village, pincode, geog, photo_url)
workers(profile_id, skills[], languages[], on_duty, last_seen, geog, upi_id,
        verified, verified_by, rating_avg, rating_count, jobs_done, tier, call_before_coming)
categories(id, parent_id, code, icon, name_en, name_hi, name_te, vision_class, rail)   -- the catalog
rate_cards(category_id, region, min_inr, max_inr)
requests(id, serial, customer_id, worker_id, category_id, diagnosis, vision_conf,
         photo_url, voice_url, geog, status, price_agreed, pay_method, created_at, …)
request_events(request_id, status, at)            -- timeline + audit
ratings(request_id, stars, tags[], by)
verifications(worker_id, id_photo_url, status, reviewed_by)   -- console / Sahayak approves
civic_tickets(…v1 ticket schema…)                  -- topping
```
`nearby_workers(lat, lng, category, lang, radius_km)` — SQL function: `on_duty AND last_seen > now()-2min AND skills @> category`, ranked by distance, tier, rating, language match. Status machine: `draft → queued → requested → accepted → on_the_way → working → done → paid → rated` (+ `declined`, `cancelled`, `disputed`).

## 6. Design

The two material worlds stay. **The lens** (dark camera, one shutter) → **the paper** (job card / receipt / grievance). The shutter-to-paper tuck remains the one orchestrated motion. Rail colours flip priority: **worklight amber is now the brand colour** (worker marketplace), stamp indigo is the civic topping, stamp green = verified / on duty, register red = disputes and SLA breach. Big icons, 48 dp+ touch targets, every category label has a speaker button that reads it aloud (device TTS, free). Copy rules unchanged: "Request Ramesh" → "Requested"; never "Submit".

## 7. Phases (30 h)

| # | Hours | Deliverable | Gate (you verify on the phone) |
|---|---|---|---|
| 0 | 0–2 | Expo app, tokens, fonts, i18n (en/hi/te), role picker, Supabase schema + seed (categories, rate cards, 12 demo workers around the venue) | installs via `adb`, language switch works |
| 1 | 2–7 | **Directory spine, no AI:** icon-grid problem picker → `nearby_workers` list with badge/rating/distance/price → Call / WhatsApp. Worker profile + **on-duty toggle + presence** | phone A goes on duty → appears on phone B's list within 3 s; call opens dialer |
| 2 | 7–12 | **Job lifecycle:** request → realtime job card on worker phone → accept/decline → timeline → done → UPI intent / cash → rating updates worker stats | full loop across two phones in < 60 s |
| 3 | 12–17 | **Show it:** vision-camera + TFLite classify → prefilled category + likely fault; low-confidence → top-2 pick; voice note; Simple mode auto-switch; shutter-to-paper motion | 10 snaps of a fan/switchboard/tap, correct category, < 1 s, network off |
| 4 | 17–21 | **Trust:** verification upload → console approve → green badge; tiers; rate-card ranges; call-before-coming; paper job card shareable to WhatsApp | unverified worker becomes verified live from the laptop |
| 5 | 21–24 | **One-bar resilience:** SQLite request queue, text-first sync, cached last-seen workers, thumbnails; Sahayak assisted-booking mode | compose a request in airplane mode → toggling network on delivers it |
| 6 | 24–27 | **Toppings, in this order, stop when time is up:** Proof of Work before/after → Report to panchayat + console map → live map view → collective weight | each ships only if fully working |
| 7 | 27–30 | Hardening: model pre-warm behind splash, seed data, 5 cold-start demo runs, kill dead UI, low-spec phone run | 5 clean runs |

Cut order if behind: Phase 6 items from the bottom up → Sahayak mode → map view. Phases 0–3 alone beat a directory app.

## 8. Vision model

Eight classes keep accuracy honest: `FAN_APPLIANCE, WIRING_SWITCH, TAP_PIPE_LEAK, PUMP_MOTOR, WOOD_FURNITURE_DOOR, VEHICLE, GARBAGE, CIVIC_ROAD_DRAIN_LIGHT`. Sub-problem ("not spinning / noise / sparking") is a 3-icon tap, not a model output. Day-one stub: **stock ImageNet MobileNetV3** with a label map — ImageNet already knows *electric fan, switch, washer, refrigerator, microwave, motor scooter, tractor, ashcan, faucet*, so the stub is genuinely useful for this domain, and the fine-tuned model is a drop-in file swap. `ml/train.py` + INT8 export + self-shot dataset manifest in the repo.

## 9. Orchestration

| Track | Who | When |
|---|---|---|
| A. Mobile app | Claude, main session, phases in order | continuous |
| B. Supabase schema, SQL functions, RLS, seed | Claude sub-agent, parallel with Phase 0–1 | needs your project URL + anon key |
| C. Web console | Claude sub-agent, parallel with Phase 2–3, integrated Phase 4 | — |
| D. Dataset photos (≥100/class, real homes & streets) + two test phones | **You** | before the event |

Each phase: plan in 3 sentences → build → install via `adb` → hand you the physical check → report → commit → **stop**.

## 10. Risks

| Risk | L | Mitigation |
|---|---|---|
| vision-camera + fast-tflite native build friction on Windows | Med | prove it in Phase 0 with a throwaway screen *before* building on it; fallback = expo-camera still photo → tflite |
| Venue Wi-Fi blocks websockets (realtime) | Med | 3 s polling fallback; phone hotspot |
| Two-phone demo needs two devices | High | second phone or emulator as the worker; console can also act as a worker |
| Free-tier Supabase pause / limits | Low | project created this week, keep-alive ping |
| Scope creep from toppings | High | Phase 6 is ordered and cuttable; nothing enters UI unfinished |
| RN performance on low-end phone | Med | Simple mode, FlashList, thumbnails, Hermes |

## 11. Judging map

End product 30% → Phases 1–2 polished, two-phone live loop · Novelty/impact 20% → photo-to-worker, price transparency, literacy-free, SDG 8 (decent work) + 10 + 11 + 6 · Creative phone use 15% → camera, on-device NN, mic, GPS presence, dialer, WhatsApp, UPI intent, TTS, haptics · Technical depth 15% → quantised on-device model, PostGIS matching, realtime presence, offline queue · Office Kit 10% / Demo 10% → console + scripted 90 s.

**Demo:** snap a dead fan → "Fan, likely capacitor, ₹150–300" → three on-duty electricians appear → request → second phone rings with the job card → accept → done → UPI opens → rate → paper job card shared to WhatsApp. Then point at the trash pile: same camera, "Report to panchayat". Closing line: **Dikha do. Theek ho jayega.**

## 12. Needed from you
1. Go-ahead on **name** and **stack switch** (the Kotlin scaffold is kept on a `kotlin-scaffold` branch, not deleted; tokens and fonts carry over).
2. Supabase project URL + anon key (free tier; you create the account).
3. Two Android phones on USB if possible (one can be low-spec — that's a feature).
4. A link for "Kaamate".
