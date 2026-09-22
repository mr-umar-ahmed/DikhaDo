# DikhaDo — Progress Log

> **This repository is a pre-event prototype.** The iQOO City Battles rules require the submitted code to be written during the event window (Sat 26 Sep 10:00 onward). Nothing here is to be copied into the event build; it is the record of what was learned.

Updated after every feature. The plan this tracks is [PLAN.md](PLAN.md). Newest entries first inside each phase; every entry names the commit that delivered it.

## Status at a glance

| Phase | What | State | Gate |
|---|---|---|---|
| 0 | Scaffold: tokens, fonts, en/hi/te, roles, schema | ✅ done | passed (emulator + phone) |
| 1 | Directory spine: picker → on-duty workers → call / WhatsApp | ✅ done | passed on phone |
| 2 | Job lifecycle: request → accept → track → pay → rate | ✅ done, reviewed, hardened | one-phone loop passed · two-phone < 60 s timing **open** |
| 3 | Local AI I — *See*: camera, on-device classifier, quality gate, safety card | ✅ done (72 ms on device) · fine-tuned model awaits the dataset | **passed** on phone, airplane mode |
| 4 | Local AI II — *Hear*: on-device speech → category; photo + voice on the job | ✅ built, speech engine verified on phone | spoken-phrase test + media upload need migration 0004 |
| 5 | Trust + Department Console | ✅ built (console verified in browser; ID upload + receipt in app) | laptop-approves-badge gate open (needs migration 0004) |
| 6 | One-bar resilience + Sahayak mode | ✅ built: offline queue, text-first uploads, assisted booking | airplane-mode booking gate open |
| 7 | Local AI III — Proof of Fix + civic rail | ✅ built, unit-tested, renders on phone | remove-the-trash re-scan gate open (needs migration 0004) |
| 8 | Local AI IV — *Write* (optional tiny LLM) | ⏳ | — |
| 9 | Demo hardening | ⏳ | — |

**Verification in place:** TypeScript strict typecheck · `mobile/scripts/lifecycle-test.mjs` (33 backend checks, last run green, realtime median ≈ 500 ms) · Metro bundle build · adversarial multi-agent code review (`docs/review-phase2.json`).

**Open items carried forward**
- Phase 2 timing gate: now runnable with one phone + `scripts/demo-bot.mjs`; result still to be recorded.
- Real SMS OTP is out of scope (paid everywhere); identity is a locally stored profile. Flagged, not hidden.
- RLS is wide open for the hackathon; marked in `0001_init.sql`.

---

## Phases 4-6 — *Hear*, media on the job, console, offline queue (built; physical gates open)

**2026-09-22 · Console deployed live; submission assets built**
- **Console deployed:** https://dikhado-console.netlify.app — the same static page, reading the real production database. `console/netlify.toml` added (`publish = "."`) so anyone can redeploy with `npx netlify-cli deploy --dir=. --prod`; `console/.netlify/` (the CLI's local site-link cache) is gitignored.
- `console.js` — small deep-link feature: `?tab=civic` / `?tab=workers` / `?tab=verify` opens the console straight into that tab, for sharing a specific view.
- README points at the live console link instead of only the local `python -m http.server` instructions.
- Video walkthrough (real screens, real timings), a 10-slide pitch deck and a 23-page project document were built for the idea-screening submission — all sourced only from this log and real screenshots, nothing fabricated. Narration re-recorded with Piper (free, offline neural TTS) after the first pass used the robotic Windows SAPI voice.

**2026-09-22 · Gates passed on the phone; official rules found**
- **Migration 0005 applied** (by the user) and verified: `civic-test.mjs` 29/29, including the five hardening checks that failed before it.
- **Voice gate passed:** the user said "fan kharab ho gaya"; the on-device recogniser transcribed it and the lexicon routed it to *Fan not working*.
- **Photo + voice on a job: passed.** `DKD-2026-000021` (Umar → Ramesh Goud) arrived with photo and voice note attached.
- **Phase 2 timing gate: passed with one phone + `demo-bot.mjs`:** request → accepted 3.7 s → on the way 7.9 s → working 13.0 s → done 19.2 s → paid 31.0 s → rated **39.5 s** (gate: < 60 s).
- Dataset started in Dataset mode: 74 photos across 10 classes, pulled to `ml/dataset/` (the pull script works from `C:\dk`; far below the 60-per-class floor, so no training yet).
- **Official rules** (https://iqoo.reskilll.com/guide, read 2026-09-22): *"Original work only: code written during the event window. No shipping a pre-built product. Open-source libraries and frameworks are fine with attribution; carrying in a completed app is not."* Organisers may verify that a project was built inside the window. **This repository is therefore a pre-event prototype and cannot be the submission.** Its value is what it proved: the architecture, the library APIs, the pitfalls, the design and the demo. See the event plan for how that knowledge is used at the event.

**2026-09-21 · Migration 0004 applied and verified live; 0005 hardening written** · _this commit_
- 0004's first run failed (`42P13`, my bug: `civic_route` selected four columns for three OUT parameters; it had never been executed because the anon key cannot run DDL and this machine has no Postgres). Fixed in `ea02ae9`; the editor's single transaction meant nothing was half-applied. **Second run succeeded.**
- `scripts/civic-test.mjs` - **24 live checks green:** routing table picks department / deadline / severity; a report 30 m away adds a signature, 250 m away or a different kind does not; unknown kind refused; department marks resolved → citizen "still there" **reopens** and the false closure stays in the history (`reported > signed > reopened_false_closure > verified_fixed`); `job-media` public, `kyc` private but readable through a signed link; approving on the console turns the badge on; jobs carry transcript, urgency, photo and voice links. Cleans up after itself.
- Booking flow re-verified after the schema change: `lifecycle-test.mjs` 33/33, realtime median 503 ms.
- Panchayat demo history seeded; console verified showing it (red row "late by 8 h", red pin; indigo pin with time left).
- A 15-agent static review of 0004 (`docs/review-migration-0004.json`): 11 findings, 0 blocking, collapsing to **5 real minor issues** → `0005_civic_hardening.sql`: geography for directly-inserted tickets (+ backfill), a vanished reporter becomes an anonymous citizen instead of an FK error, an advisory lock so simultaneous reports make one ticket, a retried report does not count a citizen twice, rejecting a duplicate ID no longer removes an approved badge. Tests written first: 5 fail today, as they should. **0005 needs to be run by you.**
- Release APK builds (arm64): 75.9 MB. Breakdown and the three levers are in the hand-over notes; native-library compression enabled via `expo-build-properties`, rebuild in progress. First failure was the disk (99% full), not the code.

**2026-09-21 · Sahayak desk, demo history, docs** · _this commit_
- **Sahayak mode is real** (the last placeholder in the app is gone): a CSC operator or neighbour enters a walk-in customer's name and phone and books in *their* name - the worker calls them, the rating is theirs - then clears the desk for the next person. Reuses the whole customer flow under an indigo "Booking for …" banner.
- `scripts/seed-demo.mjs` - three finished, paid, rated jobs (walked through the real state machine) and two panchayat reports, one already past its deadline. Ran against the live database: jobs created (`DKD-2026-000013…15`); reports wait for migration 0004. Console verified showing them: 3 jobs today, ₹630 earned.
- Console no longer polls a missing table every 5 s.
- `README.md` rewritten (run, release build, backend, console, demo, privacy, licences); `docs/SECOND_COUNTRY.md` - a second country is a data change in five places; `PLAN.md` - status and the deliberate deviations, with reasons.

**2026-09-21 · Phase 5 (app side): Verified badge flow + shareable receipt** · _this commit_
- `/verify-me` - the worker photographs an ID card (back camera) and their face (front camera); both go to a **private** storage bucket the console reads through 5-minute signed links; a `verifications` row starts the check. The duty screen shows where the badge stands - ask / being checked / approved (green stamp) / rejected with a way to retry - refreshed on focus and every 6 s while pending, so the approval made on the laptop appears on the phone by itself.
- Receipt on the job screen once paid: paper sheet, mono serial and timestamp, problem, worker, method, amount, green PAID stamp; **Share the receipt** renders it to an image (`react-native-view-shot`) and opens the share sheet (`expo-sharing`) - the worker's first formal invoice, sent over WhatsApp.
- 36 new strings in en/hi/te. Typecheck clean; bundle builds.

**2026-09-21 · Phase 7: civic rail + on-device Proof of Fix** · _this commit_
- `/report` - pick the kind (garbage, drain, pothole, streetlight, water pipe; icon + speaker), add a picture, optional note, **Send to the department**. Reached from the grid home and from the camera sheet ("This is on public land. Report it to the panchayat" - a full indigo button when the phone saw waste, a quiet link otherwise; the photo and its tensor ride along, so no second shot).
- The database's routing table - not the phone, not a model - decides department, deadline and severity. A second report of the same kind within 60 m **adds a signature** to the open ticket instead of creating another (collective weight).
- `/civic/[id]` - the paper complaint: mono serial and coordinates, status stamp, department, live deadline ("Late by 3 h 12 min" in red), "Reported by N citizens".
- **Proof of Fix, on the phone:** `src/ai/signature.ts` fingerprints a scene from the classifier's own top-40 probabilities (no second model). Re-scan with a ghost overlay of the first photo → problem strength before vs after + scene similarity → `fixed` / `still there` / `unclear`, *with the reason shown* ("This does not look like the same place"; "The phone cannot judge this kind of problem"). **The citizen has the last word** - the phone's opinion only highlights a button. "Still there" on a ticket the department closed reopens it and logs the false closure.
- Scope decision, stated plainly: a visual before/after verdict is meaningful for public problems; a repaired fan looks identical before and after, so for worker jobs the rating remains the proof.
- 10 new unit checks (48 total, green). Screen verified rendering on the Redmi. **Submitting needs migration 0004.**

**2026-09-21 · Offline booking queue** · _this commit_
`src/lib/outbox.ts` + `/queued`: a booking made with no signal is written to the phone (with its idempotent booking key, photo, voice note, and the new customer's details if they had never registered), shown as "Waiting for signal" with the worker's phone number for a plain call, and sent automatically on network return (`expo-network` listener + 15 s heartbeat + app start). Both customer homes show a "A request is waiting for signal" pill. **Gate open:** airplane mode → Request → network on → job reaches the worker untouched.

**2026-09-21 · Department Console** · `e9ad1cc`
`console/` - a static page, no build step (deliberate deviation from the Next.js plan: nothing to install or break at the venue). Live map (MapLibre + OpenStreetMap), stats strip, Jobs with **accept-on-behalf and step buttons** (same guarded moves as the phones), Verification queue with signed-URL document viewing and approve/reject, Workers with badge toggle, Panchayat reports with SLA countdowns turning red, false-closure states. Realtime + 5 s poll. Verified in a browser against the live database: 12 workers plotted, tiles loading, connection stamp live. Run: `cd console && py -m http.server 5050`.

**2026-09-21 · Speak the problem + photo and voice on the job** · `e9ad1cc`
- `SpeakToFind` - hold to talk. **On-device recognition only** (`requiresOnDeviceRecognition`; never a cloud recogniser). The same breath is persisted as the worker's voice note. No offline pack for the language → honest notice + one-tap pack download + voice-note-only path. No recogniser at all → `expo-audio` recording. **Verified on the Redmi:** Google's on-device SODA recogniser engaged; a silent hold ended in "Your voice note is saved for the worker", no crash. Spoken-phrase accuracy still needs a human voice.
- `src/ai/intent.ts` - lexicon in English, Hindi, Telugu, native and romanised ("fan kharab hai", "नल से पानी टपक रहा है", "మోటార్ స్టార్ట్ కావడం లేదు"); danger words (sparks, shock, burning) outrank everything so the safety card appears. 20 phrase checks.
- Jobs carry `transcript`, `urgent`, `vision_conf`; **text first, media later** (`src/lib/media.ts`): photo and voice upload after the job is sent, retry across restarts, never block a booking. Worker's job card shows the photo, what the customer said, a playable voice note and an Urgent stamp.
- Native rebuild with speech, audio, sharing, view-shot, network modules: success (14 min).
- `supabase/migrations/0004_media_trust_civic.sql` - storage buckets, verification trigger, Proof of Work columns, the whole civic rail (routing table, duplicate merge within 60 m, false-closure log). **Needs to be run by you once.** The app degrades gracefully until then (bookings still work; uploads wait).

## Phase 3 — Local AI I: *See* ✅ (fine-tuned model awaits the dataset)

**2026-09-21 · Phase 3 review fixes** · _this commit_
24-agent review of the Phase 3 code (4 finders, one deliberately adversarial skeptic per finding): **17 confirmed, 3 refuted, none demo-breaking**. Full report: `docs/review-phase3.json`. Fixed:
- **Why the tap was missed:** five label-map keywords were written in ImageNet's long form (`'bucket, pail'`, `'tub, vat'`, `'barrel, cask'`…) but the shipped label file is the short form, so bucket / tub / barrel / file / cab could never match - and a bucket under a tap is the rural plumbing scene. Fixed, bucket moved to plumbing, and the unit tests now assert against the **real shipped label file** (38 checks).
- Boxes and snack packets no longer stamp "Bulk waste pickup" (`carton`, `crate`, `packet` removed); `hand blower` no longer reads as a dead fan.
- The phone is never "sure" about a job when its single strongest answer was *not a job* (a face, a dog, the fine-tuned `other`).
- Android BACK on the diagnosis sheet returns to the camera instead of closing the app (and stops the spoken safety advice).
- The camera-first home now shows **Your active job** (on the viewfinder and on the sheet) and the change-role link; a finished job is forgotten so it cannot reappear offline; after a booking the lens starts fresh instead of showing the old sheet.
- "None of these" is a one-off detour to the grid; only "Choose the problem yourself" is remembered as Simple mode. That label replaces "Choose from pictures", which read as "photo gallery" under a shutter. One candidate reads "Not this".
- Stamp is ink-on-paper inside an amber rule (amber text was 2.5:1 contrast); it names the *category* the percentage refers to, with the sub-problem on its own line.
- Demo bot resumes a job from whatever status it is in (after a failed step or a restart) instead of abandoning it.
- Trainer: validation is the **last 20% of each class by capture time** - a random split put near-identical shots of one object on both sides and inflated every number; photos are centre-cropped like the app does, not stretched.
- Dataset mode: "Remove the last photo". Pull script: the phone is the source of truth (deletions stick), clear messages for two devices / release build, Git Bash path mangling disabled.
Refuted by the skeptics: "model load failure is terminal", "shutter live before the camera session starts".

**2026-09-21 · Dataset mode in the app + training pipeline verified** · _this commit_
- **Dataset mode** (`src/app/dataset.tsx`, debug builds only, reachable from the first screen): class chips with live counts, one tap = one upright 640 px training photo saved to `<app documents>/dataset/<class>/`, counter towards 150 on the shutter itself. Tested on the Redmi: photos saved, ~25-40 KB each (≈ 50 MB for a full set).
- `ml/pull_dataset.sh` copies the set to `ml/dataset/` over USB (`adb exec-out run-as … tar`) and prints per-class counts. Tested.
- `ml/.venv` (Python 3.12, TensorFlow 2.16.2) created; **`train.py` run end to end on a synthetic 3-class set.** The run found and fixed a real bug (`TFLiteConverter.from_keras_model` crashes under Keras 3 → export a SavedModel first) and a real risk: full-integer quantisation dropped accuracy 1.00 → 0.67, float16 kept 1.00. The script now exports **both** (INT8 1.2 MB, FP16 1.9 MB), measures both on the validation photos and says which to ship. The shipped graph has no augmentation or dropout in it.
- `ml/README.md` rewritten as the step-by-step: shoot in the app → pull → train → change `MANIFEST`.
Waiting on: the photos (yours to shoot, ~2 hours of walking around).

**2026-09-21 · Phase 3 physical gate: PASSED (user, Redmi Note 13 Pro+)**
Airplane-mode snaps: switchboard, appliances and carpentry were all recognised correctly, no crashes, answers well under a second (72 ms inference). Tap / plumbing was not reported - to be re-checked once the fine-tuned model lands.

**2026-09-21 · Training pipeline (`ml/`) + drop-in label routing** · _this commit_
`ml/train.py` — MobileNetV3-Small transfer learning for self-shot photos: field-style augmentation, class weighting, head training then a low-rate fine-tune of the top 40 layers, **per-class** validation report, full-integer INT8 export (uint8 in/out, softmax in the graph), and an accuracy check of the quantised model that actually ships. Folder names are the routing (`electrical__switchboard` → `dikhado:electrical/switchboard`); an `other` class lets the phone say "I cannot tell". `ml/README.md` is the shooting guide. App side: `labelMap.ts` routes `dikhado:` labels directly, so the fine-tuned model is a `MANIFEST` change and nothing else; 24 unit checks green.
**Not run yet** — needs the dataset (yours to shoot: 150+ photos per class) and Python 3.10–3.12 (this machine has 3.14, which TensorFlow does not support).

**2026-09-21 · The lens: camera → on-device diagnosis, working on the phone** · _this commit_
First end-to-end run on the Redmi Note 13 Pro+: shutter → upright photo → centre-crop → 224×224 RGB → MobileNetV3-Small on CPU → **72 ms** → paper sheet. Pointed at a wall socket, the stock ImageNet model was not confident and *said so* ("Is it this? Fan and appliances") instead of forcing an answer — the designed behaviour; sockets and switchboards are exactly what the fine-tuned model is for.
- `src/ai/model.ts` — model loaded once, warmed on a blank frame behind the splash (the load doubles as the capability probe: failure ⇒ Simple mode), calls serialised, softmax over logits, supports float32 and uint8 models.
- `src/ai/capture.ts` — vision-camera 5 `capturePhoto` → nitro-image upright bitmap → crop → two-step resize → RGBA→RGB; every native bitmap disposed in `finally`.
- `src/screens/Lens.tsx` — the lens world; the one orchestrated motion (frozen frame tucks into the header of the rising paper sheet, Reanimated 4, reduced-motion honoured); camera paused when unfocused or covered; permission and failure states all lead somewhere.
- Customer home is now camera-first; **Simple mode** (picture grid) is one tap away, remembered, and automatic when the model cannot load.
- Model + labels committed (`assets/models/`, 10.2 MB, Apache-2.0); provenance, checksum and integration notes in `docs/MODELS.md`.
- A 6-agent source-reading workflow produced the verified API recipe (`docs/research-phase3-apis.json`) — vision-camera 5 / fast-tflite 3 / nitro-image are all newer than their public docs. It also caught a release-only trap (model loading via `require()` fails outside Metro), avoided with `expo-asset`.
Open for the physical gate: ten airplane-mode snaps of a fan / switchboard / tap, each < 1 s.

**2026-09-21 · Diagnosis sheet + safety card (UI)** · _this commit_
`DiagnosisSheet` — the paper record of what the phone saw: photo in the header, "Checked on this phone. No internet used.", inference time in mono, amber class stamp with confidence, price range, then the way forward for each of the four outcomes (sure → Find workers · unsure → pick one of two · unknown → picture grid · bad photo → retake or overrule). `SafetyCard` — red-ruled advice for electrical / pump / geyser problems, read aloud once on the sheet, also shown above the workers list so the grid path gets it too. 24 new strings in en/hi/te. Not yet reachable in the app: waits for the camera screen.

**2026-09-21 · AI core: label map, quality gate, safety table, diagnosis** · _this commit_
The model-independent half of the local AI layer, in `mobile/src/ai/`, all pure functions:
- `labelMap.ts` — ~90 ImageNet labels mapped onto catalog categories and sub-problems by word-boundary keyword; related labels add up (washer 0.30 + dishwasher 0.25 = appliance 0.55); anything else is ignored rather than forced.
- `quality.ts` — dark / blurry gate from the same 224×224 tensor the model sees (mean luma, variance of Laplacian). Conservative thresholds; the user can overrule it.
- `safety.ts` — catalog code → safety card (electrical, pump, geyser). A table, never a model.
- `diagnose.ts` — one judgement per photo with three honest outcomes: *sure* (≥ 0.45), *unsure* (top two guesses), *unknown* (→ picture grid). The classifier is injected, so the TFLite model and the test fake share one interface.
- `scripts/ai-test.ts` — 21 unit checks, green (`npx tsx scripts/ai-test.ts`).
In flight: a 6-agent source-reading workflow extracting the exact vision-camera 5 / fast-tflite 3 / nitro-image APIs (all newer than public docs) and locating an official model.

---

## Phase 2 — Job lifecycle ✅

**2026-09-21 · Demo bot: the laptop plays the seeded workers** · _this commit_
`mobile/scripts/demo-bot.mjs` answers any request addressed to the 12 seeded workers - accept → on the way → working → done with a rate-card price - using the same guarded status moves as the app, realtime plus a 2 s poll, and prints the full request → rated loop time. `--here lat,lng` first moves the seeded workers to the demo spot; `--fast` shortens the pauses. Verified live: Ramesh Goud took a probe request to *done (₹230)* in 4.7 s; probe rows removed.
This **closes the last open review finding** (a request to a seeded worker used to wait forever) and makes the Phase 2 timing gate runnable with **one phone**: phone = customer, laptop = worker.

**2026-09-21 · Review fixes** · `53192ff`
A 35-agent review (5 finders, one skeptic per finding, 30 findings, 0 refuted) ran against Phases 1–2. Fixed:
- *Demo-breaking:* duplicate Supabase realtime topic crashed the app on the one-phone role-switch path → unique topic per subscription, try/catch to polling, stack reset on role change and after a finished job.
- *Demo-breaking:* on-duty worker vanished from search 2 min after the screen slept (JS heartbeat stops) → screen kept awake on duty, 10-minute presence window, visible warning when heartbeats fail.
- Database transition guard (illegal moves refused; `done` needs an amount, `paid` needs a method; jobs count on payment, not on rating).
- Booking is idempotent: key minted once per booking, duplicate insert resolves to the first job; no second customer profile on retry.
- Guarded status moves from the last seen status; a stale phone is told "this job changed on the other phone".
- Every failed tap explains itself; 10 s network timeout; 8 s location bound; blocked permission opens Settings; cached worker list on any failure.
- Keyboard no longer covers inputs or eats the first tap; one open job at a time; both sides can back out before work starts; worker sees "paid ₹X by UPI"; offline inbox cache.
- Ranking: unrated ≠ zero stars. `move_demo_workers(lat,lng)` relocates the seed. Copy fixes in all three languages.
- Migration `0003_guards_presence_ranking.sql` applied; smoke test extended to 33 checks — **all green**.

**2026-09-21 · Backend smoke test** · `585a201`
`scripts/lifecycle-test.mjs`: matching, serials, triggers, idempotency, timeline, realtime latency, cleanup of its own rows. Found and explained one false alarm (Supabase attaches its DB listener slightly after reporting SUBSCRIBED).

**2026-09-21 · Job lifecycle** · `d454213`
Request screen, live job screen (serial, timeline, haptic on change), worker inbox with accept/decline and step buttons, amount entry, UPI intent + cash, rating with tags, realtime + 5 s polling, active-job banner, UPI id on worker setup. Migration `0002_request_latlng.sql`.

## Phase 1 — Directory spine ✅

**2026-09-21** · `4648fb4` → verified on Redmi Note 13 Pro+
Catalog of 10 services + sub-problems with rate cards (en/hi/te); icon grid with speaker buttons (device TTS); nearby on-duty workers from PostGIS with verified badge, rating, tier, distance; Call and WhatsApp with a pre-written message; worker registration; on-duty heartbeat; cached list for no signal.
Build: native Android build proven with `react-native-vision-camera` 5 + `react-native-fast-tflite` 3 + Nitro modules — the biggest technical risk of Phase 3 retired early.
Environment lessons: build from `C:\dk` (OneDrive path breaks the 260-char limit; a `subst` drive breaks codegen because Node realpaths it); JDK 17 required; Xiaomi needs *Install via USB*.

## Phase 0 — Scaffold ✅

**2026-09-20** · `6eb7e44`, `746af8d`
Pivot from the civic-first "Theek" concept to the worker marketplace "DikhaDo" after competitor research (KaamAdda, Mazdoor Sytu, Deelo). Stack switched from Kotlin/Compose to Expo + Supabase; the Kotlin scaffold is kept on branch `kotlin-scaffold`. Design tokens, bundled IBM Plex + Noto Telugu fonts, en/hi/te with compile-time completeness, language + role picker, both material worlds, Supabase schema (`0001_init.sql`) + seed (catalog, rate cards, 12 demo workers).
