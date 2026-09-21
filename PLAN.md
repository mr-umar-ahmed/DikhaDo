# DikhaDo — Complete Plan

*Dikha do. Theek ho jayega.* — Just show it. It gets fixed.

This is the single source of truth for what DikhaDo is, why each decision was made, and every phase from the first commit to the demo. Progress against it is logged in [PROGRESS.md](PROGRESS.md). Event: iQOO City Battles Hyderabad, 26–27 Sep 2026 (30-hour build). Repository: https://github.com/mr-umar-ahmed/DikhaDo

---

## 1. The problem

In rural India and small towns, finding an electrician, plumber, pump mechanic or carpenter runs on word of mouth. There is no place to search, nothing to verify, no idea what the job should cost, and the apps built for metros assume a literate user on fast data with a credit card. The household waits days; the skilled worker two lanes away sits idle.

**DikhaDo** is a rural-first, hyperlocal worker marketplace. Its wedge is one gesture nobody else offers: *you do not type, you do not browse a menu — you show the broken thing to your phone.* A small AI model **running on the phone itself** names the problem, the app lists trusted workers who are on duty nearby **with a price range before you call**, and a job runs from request to payment to rating. It works with AI switched off, on a ₹6,000 phone, on one bar of signal.

Judging weights we are building to: end product quality 30%, novelty and impact 20%, creative phone use 15%, technical depth 15%, Office Kit 10%, demo 10%.

## 2. What we learned from the field (competitor research, 20 Sep 2026)

| App | What it does well — we include it | The gap we exploit |
|---|---|---|
| **KaamAdda** | category + location search, one-tap call / WhatsApp, "post work", 9 languages | static directory: no live availability, no price, no job lifecycle |
| **Mazdoor Sytu** | live map of nearby workers, OTP verification, apply → shortlist → hire, chat, farm categories (tractor, harvest labour) | job-board pace; Hindi/English only; Google Maps dependency |
| **Deelo** | worker sees job details and payout *before* accepting; ID check → trust badge; one reputation across services; earnings ledger | urban Kerala, delivery-centric |
| Urban Company (reference) | fixed rate cards, job timeline | metro-only, literate smartphone users |
| Kaamate | not found under any spelling — dropped | — |

Nobody does photo → diagnosis → matched worker. Nobody shows a price range before the call. Nobody serves a user who cannot read a category tree. Names checked and already taken in this category: KaamSetu, Haazir, Kushal — hence **DikhaDo**, named after the gesture.

## 3. Hard rules

1. **All AI runs on the phone.** No cloud vision, no cloud speech, no cloud LLM, no paid API of any kind. Internet is used only for the marketplace itself (who is on duty, job status).
2. **The app is fully usable with AI off.** AI saves taps; it is never the only way through. Low-spec phones get Simple mode automatically.
3. **Works on weak signal.** Every network call times out; every failure says what happened and what to do; the last known data is always shown; a request composed offline is sent when signal returns.
4. **A working small thing beats a broken big thing.** Nothing appears in the UI until it works. No dead buttons. Cut scope inside a phase, never ship half a feature.
5. **Services are rows, not screens.** A new service is one row in `categories` + `rate_cards` and one entry in `mobile/src/data/catalog.ts`.
6. **Routing is deterministic.** The model proposes a class; tables decide category, price range, safety advice and rail (worker vs panchayat). A language model never chooses routing.
7. **₹0 to run.** Supabase free tier, OpenStreetMap tiles, UPI intents, device TTS/ASR, bundled fonts.
8. Gated phases: plan → build → verify myself (typecheck, backend smoke test, emulator/phone) → hand the physical check to the human → log in PROGRESS.md → commit → **push**.

## 4. The local AI layer — the technical heart

One module, `mobile/src/ai/`, owns every model. Screens ask it questions; they never touch a model directly. A **capability probe** at first launch picks the highest tier the phone can carry, and everything degrades downward without losing a feature's *outcome* — only its convenience.

| Tier | Needs | Adds |
|---|---|---|
| 0 Simple | any phone | icon grid, voice note as audio, templates. No model loaded. |
| 1 See | ~2 GB RAM, model loads | vision classifier + embeddings (~3–5 MB, INT8) |
| 2 Hear | device has on-device speech for the language | speak the problem, hands-free |
| 3 Write | ≥ 6 GB RAM, optional model file present | tiny local LLM drafts job notes and formal grievances |

### What local AI does, feature by feature

| # | Feature | How (all on device) | Phase | Fallback when unavailable |
|---|---|---|---|---|
| A1 | **Name the problem from a photo** | MobileNetV3-Small INT8 via `react-native-fast-tflite` on a 224×224 frame from `react-native-vision-camera`; 8 classes; top-2 shown when confidence < 0.45 | 3 | icon grid |
| A2 | **Reject useless photos** | mean luminance + edge energy computed from the same 224×224 tensor: "too dark" / "too blurry, hold still" before classifying | 3 | none needed |
| A3 | **Safety triage** | class → safety table: sparking wiring, burning smell, leaking gas cylinder ⇒ red card "switch off the mains, keep children away" spoken aloud, job flagged urgent | 3 | same table from the picked category |
| A4 | **Price before the call** | predicted class → rate card range | 3 | same, from picked category |
| A5 | **Worker vs panchayat** | class decides the rail: a broken fan → worker; a garbage heap or open drain on public land → "Report to panchayat" | 3 / 7 | user picks |
| A6 | **Speak the problem** | Android on-device `SpeechRecognizer` (no network) → local intent matcher: a hi/te/en keyword lexicon maps "pankha nahi chal raha" → `fan_dead` | 4 | voice note recorded and attached as audio |
| A7 | **Proof of Work** | before/after photos through the same network; penultimate-layer embedding cosine + re-classification ⇒ `fixed` / `still broken` / `unclear`. Honest three states, never a fake binary | 7 | photos stored side by side, human judges |
| A8 | **Duplicate civic reports** | geohash bucket + embedding cosine > 0.8 ⇒ merge and add a signature instead of a new ticket | 7 | geohash + same class only |
| A9 | **Write it properly** *(capable phones only)* | tiny local LLM (Gemma 3 270M / 1B, GGUF, via `llama.rn`), strict JSON, parsed defensively: transcript + class → clean job note for the worker, formal department-addressed grievance in English + the user's language | 8 | deterministic templates — always present, LLM only improves them |
| A10 | **Read it aloud** | device text-to-speech on every label, status change and safety card | 1 ✔ | — |

Why a tiny classifier and not a big multimodal model: eight classes on a self-shot dataset stay accurate, load in under a second behind the splash, run in < 100 ms on a mid-range phone, and fit a ₹6,000 handset. The richness lives in tables, which are cheap, auditable and cannot hallucinate.

**Vision classes (8):** `FAN_APPLIANCE, WIRING_SWITCH, TAP_PIPE_LEAK, PUMP_MOTOR, WOOD_FURNITURE_DOOR, VEHICLE, GARBAGE, CIVIC_ROAD_DRAIN_LIGHT`. Sub-problem ("not spinning / noisy / sparking") is a tap, not a model output.
**Day-one model:** stock ImageNet MobileNet with a label → class map (`mobile/src/ai/labelMap.ts`). ImageNet already knows *electric fan, switch, washer, refrigerator, microwave, faucet, motor scooter, tractor, ashcan, power drill*, so the stub is genuinely useful. The fine-tuned model (`ml/train.py`, self-shot photos, INT8 export) is a drop-in file swap — same input, same interface.

## 5. Product

### Roles (one app; chosen at first launch, switchable)
**Customer** · **Worker** · **Sahayak** (CSC operator or village helper who registers workers and books for people without a smartphone).

### Core loop
1. **Show it** — camera opens; snap the broken fan → "Fan and appliances › likely not spinning, ₹150–300". Or tap the icon grid. Or (Tier 2) say it.
2. **See who is here** — workers on duty now, nearest-and-most-trusted first: verified badge, rating, jobs done, languages, distance, price range.
3. **Request, or just call** — "Request Ramesh" sends a job card; Call and WhatsApp are always one tap away, because that is how Bharat books.
4. **Track** — requested → accepted → on the way → working → done. Either side can back out before work starts.
5. **Pay** — cash, or a UPI intent (`upi://pay`) that opens PhonePe / GPay / Paytm. No gateway, no fee.
6. **Rate** — stars + three tap-tags; feeds the worker's tier (New → Trusted → Star).

### Worker side
Profile (skills, languages, UPI id) · on/off duty with location heartbeat and screen kept awake · job card shows problem, distance and price range *before* accepting · step buttons · sees "Ravi paid ₹250 by UPI" · reputation that raises ranking.

### Service catalog
Electrical · Plumbing · Pump and tubewell · Fan and appliances · Carpentry · Bike and tractor repair · **Garbage pickup** · Mason and painting · Farm labour and tractor · Cleaning and tank cleaning — each with sub-problems and a rate card, in English, Hindi and Telugu.

### Toppings (from the original "Theek" concept)
Report to panchayat (civic rail, paper grievance record, SLA clock, console map) · Proof of Work before/after · shareable paper job card · offline request queue · collective weight for duplicate civic reports.

### Vision slide only — not built
IVR, UPI 123PAY feature-phone flow, WhatsApp chatbot booking, insurance / tools / training, subscriptions and platform-fee billing, DigiLocker KYC, real SMS OTP (costs money on every provider). Revenue model for the pitch: ₹10–30 per completed job or ₹99–299/month worker subscription.

## 6. Architecture

```
mobile/                       Expo SDK 57 · React Native 0.86 · TypeScript · expo-router
  src/app/                    routes: index (language+role), home, category/[code], workers/[code],
                              request, job/[id]   (+ lens, verify, report in later phases)
  src/screens/                CustomerHome, WorkerHome
  src/components/             paper (PaperScreen, PrimaryButton, Notice), CategoryTile, WorkerInbox, …
  src/ai/                     ★ local AI layer: capabilities, classifier, quality, labelMap, safety,
                              intent (speech → category), embeddings, drafter (LLM + templates)
  src/data/catalog.ts         the service catalog — the only region-specific data file
  src/i18n/strings.ts         en / hi / te, type-checked for completeness
  src/lib/                    supabase (10 s timeout), api (matching, heartbeat), requests (job
                              lifecycle, live hooks, offline caches), location (8 s bound), prefs
  src/theme/                  tokens (7 named colours), type (bundled Plex + Noto, per-language family)
  assets/models/              *.tflite (small, committed); large LLM files are pushed by adb, never committed
  scripts/lifecycle-test.mjs  33-check backend smoke test
supabase/
  migrations/0001…0003        schema, PostGIS matching, triggers, transition guards
  seed.sql                    catalog, rate cards, 12 demo workers; move_demo_workers(lat,lng)
console/                      static page, no build step (MapLibre + supabase-js): live map, jobs, verification queue, civic tickets
ml/                           train.py, export to INT8 tflite, dataset manifest (Phase 3)
docs/                         review reports, screenshots, MODELS.md, SECOND_COUNTRY.md
```

**Backend (Supabase free tier):** Postgres + PostGIS (`nearby_workers` ranks by distance minus trust bonuses, 10-minute presence window), Realtime (job status ~500 ms), Storage (photos, voice notes), triggers that own every derived fact (serial, timeline, reputation, tier) and refuse illegal status moves. Hackathon-only open RLS, marked in the migration.

**Design system.** Two material worlds. *The lens* — dark, near-monochrome, camera fills the screen, one shutter. *The paper* — pale form-paper, ruled header, monospace serial, stamped classification: the job card, the receipt, the grievance. One orchestrated motion: the frozen frame shrinks and tucks into the header of a paper sheet rising from below; everything else is state-change motion and respects reduced-motion. Tokens: lens ink `#0D0E0C`, lens surface `#191B18`, form paper `#D9E2DE`, **worklight amber `#C77A16` (brand, worker rail)**, stamp indigo `#2C3E8F` (civic rail), stamp green `#2F6B4F` (verified, on duty), register red `#A82A22` (danger, dispute, SLA breach). Type: IBM Plex Sans / Sans Devanagari, Noto Sans Telugu, Plex Mono for serials and coordinates only. Touch targets ≥ 52. Rejected on sight: caps eyebrows, arrows in buttons, middle-dot meta strings, identical shadowed cards, gradient washes, "Oops".

**Build environment (Windows).** Native builds must run from a short real path (`C:\dk`), not the OneDrive folder (260-char limit) and not a `subst` drive (Node realpaths it). `JAVA_HOME` must be JDK 17. Xiaomi phones need *Install via USB* enabled.

## 7. Phases

**Status, 21 Sep 2026:** Phases 0-7 are built; 0-3 have passed their physical gates on a Redmi Note 13 Pro+. Phases 4-7 are built, type-checked and unit-tested, and their speech engine, screens and console are verified on the phone / in a browser; their end-to-end gates wait on database migration 0004 and a human voice. Phase 8 (optional LLM) is not started. See PROGRESS.md for the evidence behind each line.

**Deliberate deviations from the first version of this plan**
- *Console is a static page, not Next.js.* Same features, but nothing to install, build or break at the venue; it opens with `python -m http.server`.
- *Proof of Work became Proof of Fix, on the civic rail only.* A before/after verdict means something for a garbage heap or an open drain. A repaired fan looks the same before and after, so for worker jobs the rating stays the proof. Saying so is better than shipping a verdict that cannot be right.
- *Scene fingerprints come from the classifier's own output* (top-40 probabilities) instead of a second 6 MB embedding model: zero extra download, fast enough, and good at the one thing needed - "is this the same place?".
- *Offline queue uses AsyncStorage, not SQLite:* a handful of small records; one less native module.
- *On-device speech is strict:* `requiresOnDeviceRecognition` always. No pack for the language means a voice note, never a cloud recogniser.

Each phase lists goal, scope, the decisions that matter, how it is verified, the physical gate, and what gets cut first if time is short.

### Phase 0 — Scaffold ✔
**Goal:** an app that installs, in the right visual language, in three languages.
**Built:** Expo project; seven colour tokens; bundled fonts with per-language family selection (React Native does not fall back per glyph across bundled families); en/hi/te with compile-time key completeness; language + role picker persisted in AsyncStorage; both material worlds; Supabase schema + seed. A first Kotlin scaffold is preserved on branch `kotlin-scaffold`.
**Decision:** Expo over Kotlin/Flutter — Node was already installed, TypeScript is shared with the console, and on-device TFLite still works through a dev build.
**Gate:** installs via `adb`; Telugu switch re-renders everything. **Passed** (emulator + Redmi Note 13 Pro+).

### Phase 1 — Directory spine, no AI ✔
**Goal:** already better than a directory app: find an on-duty worker and call them.
**Built:** icon-grid problem picker with speaker buttons; sub-problems with price ranges; "Something else" so nobody is stuck; `nearby_workers` list (verified badge, rating, jobs, tier, distance); Call and WhatsApp with a pre-written message in the user's language; worker registration; on-duty toggle with heartbeat; last list cached for no-signal use.
**Gate:** a worker who goes on duty appears for a customer; dialer and WhatsApp open. **Passed** on phone.

### Phase 2 — Job lifecycle ✔ (two-phone timing check still open)
**Goal:** request → accept → track → pay → rate, live between two phones.
**Built:** request screen (asks who you are once); live job screen with serial and timeline; worker inbox with the whole job visible before accepting; step buttons; amount entry; UPI intent / cash; rating with tags; Realtime + 5 s polling floor; active-job banner.
**Hardened by a 35-agent adversarially verified review (30 findings, all fixed except the phantom-worker auto-accept, deferred to the console):** database transition guard; idempotent booking key; unique realtime topics (realtime-js throws on a reused one — this crashed the one-phone test path); keep-awake while on duty; 10 s network and 8 s location bounds; every failed tap explained; keyboard handling; one open job at a time; both sides can back out; payment confirmation for the worker; offline inbox cache.
**Verified:** `scripts/lifecycle-test.mjs` — 33 checks green against the live backend, realtime median ≈ 500 ms.
**Gate:** full loop across two phones in under 60 s. One-phone loop passed; two-phone timing pending a second device.

### Phase 3 — Local AI I: *See* ✔ (fine-tuned model awaits the self-shot dataset)
**Goal:** the signature gesture. Point, snap, and the phone names the problem — with no network.
**Scope:**
1. `src/ai/capabilities.ts` — probe RAM / low-RAM flag / model load → tier; Simple mode toggle in the role screen.
2. `src/ai/classifier.ts` — load the TFLite model once behind the splash and keep it for the process lifetime; `classify(photo) → [{class, confidence}]`.
3. `src/ai/quality.ts` — dark / blurry gate from the same tensor (A2).
4. `src/ai/labelMap.ts` — ImageNet label → DikhaDo class (day-one stub); `src/ai/safety.ts` — class → safety card (A3).
5. `src/app/lens.tsx` — the lens world: full-screen camera, one shutter, "Works on weak signal" badge, link to the icon grid. Becomes the customer's launch screen when tier ≥ 1.
6. Diagnosis sheet on paper: photo tucked in the header, class stamp, confidence, price range, safety card if any, "Find workers" → existing flow; top-2 choice when unsure; "None of these" → icon grid.
7. The shutter-to-paper motion (Reanimated), cut to a crossfade under reduced-motion.
8. `ml/` — training script, INT8 export, dataset manifest, `docs/MODELS.md`.
**Decisions:** classify a still photo, not a live frame stream — simpler, cooler on the battery, and the frozen frame is the hero of the animation. Photo is attached to the job (Phase 4 uploads it lazily, text first).
**Verify:** unit-test the label map and quality maths in Node; on-device timing logged.
**Gate (physical):** in airplane mode, ten snaps of a fan / switchboard / tap give the right category in under a second each, zero crashes.
**Cut line:** the motion (→ crossfade), then the quality gate. Never the fallback to the grid.

### Phase 4 — Local AI II: *Hear*, and the photo + voice on the job (built)
**Goal:** a user who cannot read or type can still book.
**Scope:** hold-to-speak on the lens and the grid; on-device speech recognition (`expo-speech-recognition`, on-device flag, hi-IN / te-IN / en-IN); `src/ai/intent.ts` keyword lexicon → category, shown as a confirmable suggestion; if on-device speech is unavailable the same button records an 8-second voice note (AAC ~16 KB); photo (≤1280 px, q60) and voice note upload to Supabase Storage *after* the text job is sent; worker's job card plays the note and shows the photo.
**Risk:** many phones lack offline hi/te speech packs — hence the voice-note fallback is a first-class path, and the probe decides per language.
**Gate:** speak a problem in Telugu or Hindi in airplane mode → right category suggested; with network on, the worker phone shows the photo and plays the note.
**Cut line:** intent matching for Telugu, then on-device speech entirely (voice note only).

### Phase 5 — Trust, and the Department Console (built)
**Goal:** answer "why should I let this stranger into my house?"
**Scope:** worker uploads ID + selfie → `verifications`; web console (Next.js + Tailwind + MapLibre + Supabase realtime): verification queue with approve/reject, live job map, SLA-style clocks, **accept-on-behalf for seeded demo workers** (closes the last open review finding); green Verified badge live on phones; tier rules visible to the worker; "call before coming" preference honoured on the job card; paper job card rendered as an image and shared to WhatsApp as the worker's invoice.
**Gate:** an unverified worker becomes verified from the laptop and the badge appears on the customer phone within five seconds.
**Cut line:** map view in the console (table only), then invoice sharing.

### Phase 6 — One-bar resilience and Sahayak mode (built: offline queue, assisted booking)
**Goal:** the promise on the badge is literally true.
**Scope:** `expo-sqlite` write-ahead queue for requests composed with no signal; visible "Queued — sends when signal returns" state; text first (~2 KB), photo and voice later, byte counts logged as evidence; cached catalog + last workers; Sahayak mode: register a worker on their behalf, book for a walk-in customer with the customer's phone number on the job.
**Gate:** compose a request in airplane mode → toggle network on → it reaches the worker without touching the phone again.
**Cut line:** Sahayak worker-onboarding (keep assisted booking).

### Phase 7 — Local AI III: Proof of Fix, and the civic rail (built)
**Goal:** the accountability layer, and the original Theek idea as a topping.
**Scope:** after "done", optional before/after: ghost overlay of the first photo for alignment, embedding cosine + re-classification → three-state verdict shown to both sides and stored for disputes; civic rail: when the model sees `GARBAGE` / `CIVIC_*` on public land the sheet offers "Report to panchayat" → paper grievance with serial, department and SLA from a routing table → console map with countdown, red on breach; duplicate reports merge by geohash + embedding similarity and add signatures (collective weight).
**Gate:** remove the planted trash and re-scan → `fixed`; leave it → `still broken` even if the console marked it resolved, and the false closure is logged.
**Cut line:** collective weight, then the civic console map.

### Phase 8 — Local AI IV: *Write* (optional, capable phones only)
**Goal:** the farmer speaks eight seconds; the phone hands back a formal document.
**Scope:** probe first (`llama.rn` build on Windows, tokens/s on the demo phone) — if < 8 tok/s or the build fights back for more than an hour, stop and keep templates; model file pushed by `adb`, never bundled; strict-JSON prompt with routing facts supplied, output only `title, body_en, body_local, note_for_worker`; defensive parse (strip fences, close braces) → per-field template fallback; runs after the job is already sent, so it can never block booking.
**Gate:** six seconds of Hindi/Telugu → a correctly worded grievance in under twelve seconds, offline, five runs.
**Cut line:** the whole phase. Templates ship in Phase 7 regardless.

### Phase 9 — Demo hardening (never cut)
Pre-warm models behind the splash; release build (Hermes, arm64 + armv7, target ≤ 35 MB without the optional LLM); seed data moved to the venue with `move_demo_workers`; kill every placeholder, debug string and dead control; five cold-start runs of the script in a row; run on the lowest-spec phone available; README reproducibility pass (clean clone → build → smoke test); `docs/SECOND_COUNTRY.md` (catalog + strings + seed = Nairobi).

**If time runs out:** Phases 0–3 alone beat every directory app in the room. Order of sacrifice: 8 → collective weight → civic console map → Sahayak onboarding → console map view.

## 8. Demo script (90 seconds)

1. *"Signal here is one bar."* Turn on airplane mode in front of the judges. Point at a dead table fan. Snap. The frame tucks into a paper sheet: **Fan and appliances · ₹150–300**, read aloud in Telugu. No network was used.
2. Network on. Three on-duty electricians appear, Ramesh first — verified, 4.8, 800 m. **Request Ramesh.**
3. The second phone buzzes with the job card: problem, distance, price. **Accept → On the way → Work is done, ₹250.**
4. First phone: **Pay ₹250 with UPI** opens the UPI app. **Rate:** five stars, "Came on time". Ramesh's count ticks up live on the console.
5. Point the same camera at the planted trash: the sheet turns indigo — **Report to panchayat** — and the ticket lands on the console map with its clock running.

Closing line: **Dikha do. Theek ho jayega.**

## 9. Judge-readiness

**Reproducibility** — clean clone builds with documented steps; models documented with sources and checksums; one command checks the backend. **Grounding** — self-shot dataset from real homes and streets. **Privacy** — photos are classified on the phone; an image leaves the device only as part of a job the user sends, only to the project's own storage, never to a third-party AI. **Scalability** — catalog, strings and seed are the only region-specific files. **Rigor** — quantised on-device vision, database-enforced state machine, idempotent offline-tolerant writes, an honest three-state Proof of Work, and an adversarially verified code review in `docs/`. **SDGs** — 8 decent work, 10 reduced inequalities (no literacy barrier), 11 sustainable communities, 6 clean water and sanitation (civic rail), 9 innovation (edge inference on commodity phones).

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| vision-camera 5 / fast-tflite 3 API friction (both newer than most documentation) | Medium | native build already proven on Windows; read the installed sources, not blog posts; fallback: `expo-image-picker` photo → same classifier |
| Stock ImageNet stub mislabels Indian appliances | Medium | top-2 choice under low confidence; "None of these" → grid; fine-tuned model is a file swap |
| No offline hi/te speech pack on the demo phone | High | voice-note path is first-class; probe per language; pre-download packs on Wi-Fi |
| Local LLM too slow or build fails | High | Phase 8 is optional, probed first, behind templates |
| Venue Wi-Fi blocks websockets | Medium | 5 s polling floor already in place; phone hotspot |
| Two-phone demo needs two devices | Medium | console can accept on behalf of a worker (Phase 5) |
| Seeded workers outrank the real phone and cannot answer | Medium | 60 s "no answer" notice now; console accept-on-behalf in Phase 5 |
| Scope creep | High | phases are ordered and each has a cut line; Phase 9 is reserved time |
