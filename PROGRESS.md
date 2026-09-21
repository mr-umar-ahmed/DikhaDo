# DikhaDo — Progress Log

Updated after every feature. The plan this tracks is [PLAN.md](PLAN.md). Newest entries first inside each phase; every entry names the commit that delivered it.

## Status at a glance

| Phase | What | State | Gate |
|---|---|---|---|
| 0 | Scaffold: tokens, fonts, en/hi/te, roles, schema | ✅ done | passed (emulator + phone) |
| 1 | Directory spine: picker → on-duty workers → call / WhatsApp | ✅ done | passed on phone |
| 2 | Job lifecycle: request → accept → track → pay → rate | ✅ done, reviewed, hardened | one-phone loop passed · two-phone < 60 s timing **open** |
| 3 | Local AI I — *See*: camera, on-device classifier, quality gate, safety card | ✅ done (72 ms on device) · fine-tuned model awaits the dataset | **passed** on phone, airplane mode |
| 4 | Local AI II — *Hear*: on-device speech → category; photo + voice on the job | ⏳ | — |
| 5 | Trust + Department Console | ⏳ | — |
| 6 | One-bar resilience + Sahayak mode | ⏳ | — |
| 7 | Local AI III — Proof of Work + civic rail | ⏳ | — |
| 8 | Local AI IV — *Write* (optional tiny LLM) | ⏳ | — |
| 9 | Demo hardening | ⏳ | — |

**Verification in place:** TypeScript strict typecheck · `mobile/scripts/lifecycle-test.mjs` (33 backend checks, last run green, realtime median ≈ 500 ms) · Metro bundle build · adversarial multi-agent code review (`docs/review-phase2.json`).

**Open items carried forward**
- Phase 2 timing gate: now runnable with one phone + `scripts/demo-bot.mjs`; result still to be recorded.
- Real SMS OTP is out of scope (paid everywhere); identity is a locally stored profile. Flagged, not hidden.
- RLS is wide open for the hackathon; marked in `0001_init.sql`.

---

## Phase 3 — Local AI I: *See* (in progress)

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
