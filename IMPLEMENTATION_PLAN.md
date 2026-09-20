# Theek — Implementation Plan

Event: iQOO City Battles Hyderabad, 26–27 Sep 2026. 30-hour build. Plan written 20 Sep 2026.

## 0. Ground rules carried from the master prompt

- All inference on-device. App fully functional in airplane mode. Sync never blocks.
- Gated phases: build → install → hand over physical check → report → commit → stop.
- Services are routing-table rows, never screens. The LLM never picks routing.
- No UI element ships until it works. Template fallback beats a crash.

## 1. Architecture (single `:app` module, package-by-layer — no multi-module overhead in 30 h)

```
com.theek.app
├─ ui/theme        Color, Type, Theme (two material worlds: Lens / Record)
├─ ui/lens         CameraX viewfinder, shutter, offline badge, diagnosis sheet
├─ ui/record       Paper ticket, mic + waveform, send
├─ ui/queue        Pending / sent list
├─ ui/verify       Proof of Fix: ghost overlay re-capture, verdict
├─ nav             Routes, NavHost (start destination = lens)
├─ core/routing    RoutingTable.kt  ← the ONLY region-specific file (+ strings)
├─ core/vision     DefectClassifier (LiteRT), EmbeddingExtractor, StubMapper
├─ core/speech     Transcriber interface → SpeechRecognizerImpl | WhisperImpl
├─ core/llm        Drafter interface → MediaPipeDrafter | LlamaCppDrafter | TemplateDrafter
├─ core/ticket     Ticket model, TicketAssembler (deterministic fields first), JsonRepair
├─ data            Room (TicketEntity, AccountabilityEntity), TicketRepository
├─ sync            TextSyncWorker (first, alone), PhotoSyncWorker (lazy), SupabaseApi
└─ ModelWarmup     splash-gated pre-warm, sessions held for process lifetime
console/           Next.js + Tailwind + MapLibre, Supabase realtime
ml/                training notebook/script, dataset manifest, export to INT8 .tflite
docs/              MODELS.md (where to get model files + checksums), SECOND_COUNTRY.md
```

Key seams (interfaces so fallbacks are a one-line swap, decided by device probe, not by hope):
`DefectClassifier`, `Transcriber`, `Drafter`. Each has a guaranteed-to-work last-resort impl
(stub mapper / typed text entry hidden unless ASR fails / template drafter).

### Data flow
```
shutter → Bitmap(224²) → DefectClassifier → (class, conf)
        → RoutingTable.resolve(class, boundary) → rail, route_to, sla, default severity, flags
        → hold mic → Transcriber → text(lang)
        → TicketAssembler: deterministic fields filled → Drafter(prompt w/ fixed fields) → JSON
        → JsonRepair.parse || TemplateDrafter → clamp severity to default±1
        → Room (PENDING) → TextSyncWorker (≈4 KB JSON) → PhotoSyncWorker (JPEG q60, ≤1280px, later)
```

## 2. Phase plan

| Phase | Hours (budget) | Deliverable | Gate | In-phase cut line |
|---|---|---|---|---|
| 0 Scaffold | 0–1.5 | Compose app, tokens, type, nav, placeholders, git | builds + installs, theme visible | — |
| 0.5 Device probe | 1.5–3 | Probe screen (debug build only): Gemma 2B via MediaPipe tok/s, offline SpeechRecognizer hi-IN/te-IN availability, LiteRT NNAPI/GPU delegate | decision recorded in `docs/DEVICE_DECISIONS.md` | if Gemma < 8 tok/s → Llama 3.2 1B; if no offline te/hi pack → whisper.cpp tiny |
| 1 Spine | 3–8 | Lens launch, shutter, classifier, routing table, diagnosis sheet, freeze-and-tuck motion | airplane mode, <1 s, 10×, 0 crashes | stock MobileNet + class-mapping stub; motion simplified to crossfade under reduced-motion |
| 2 Voice→grievance | 8–15 | hold-mic + waveform, ASR, drafter, JSON repair, paper record | 6 s speech → ticket <12 s offline, 5 runs w/ variance | one language only (Telugu or Hindi); `body_local` = raw transcript if LLM weak in that script |
| 3 Queue/sync/console | 15–21 | Room WAL queue, WorkManager, text-first sync, console map + SLA clock | network on → console row <5 s | console: table + map only, no auth, no filters |
| 4 Proof of Fix | 21–25 | geofence prompt, ghost overlay, classifier + embedding distance, 3-state verdict, accountability log | remove trash → verified; leave → stays open | geofence → manual "Verify" on ticket; keep 3-state verdict |
| 5 Collective weight | 25–26.5 | geohash-7 bucket + embedding cosine → merge, signature count | — | skip entirely if Phase 4 slips |
| 6 Hardening | 26.5–30 | pre-warm, seed 3 tickets, 5 cold runs, kill dead UI, loaner check | 5 clean cold-start runs | never cut |

Hardening is reserved time. Phase 5 is the first thing dropped, then the geofence, then the private job-card polish.

## 3. Phase detail

### Phase 0 — Scaffold
Kotlin 2.0 + Compose BOM, minSdk 26, compile/target 35. `TheekColors` with all seven tokens; `LensTheme` (dark) and `RecordTheme` (paper) as two composition-local worlds under one `TheekTheme`. Bundled fonts (no downloadable fonts — they need network): IBM Plex Sans, Plex Sans Devanagari, Noto Sans Telugu, Plex Mono (serials/coords only). NavHost start = lens.

### Phase 0.5 — Device probe (the "first three hours" decision)
Debug-only screen, never in release nav. Measures: LLM load time + decode tok/s, ASR offline availability per locale (`RecognizerIntent.EXTRA_PREFER_OFFLINE`, `SpeechRecognizer.createOnDeviceSpeechRecognizer` on API 31+, `checkRecognitionSupport` on 33+), classifier latency per delegate. Output is a written decision, not a vibe.

### Phase 1 — Spine
- CameraX `Preview` + `ImageCapture` (min-latency mode); classify from the preview-resolution bitmap, keep full-res JPEG on disk for later lazy upload.
- `RoutingTable`: `enum DefectClass(SW, SEW, HW, POT, LIGHT, WATER, WIRE, APPL)` → `Route(rail, routeTo, slaHours, defaultSeverity, autoFlag)`. Boundary rule: default rail from class; one "Arrange a worker instead" / "Report to department instead" toggle on the diagnosis sheet flips `SW`/`WATER` to their private rows. Classes with no alternate rail show no toggle.
- Stub path: stock MobileNetV3 ImageNet → hand map (e.g. `ashcan`, `plastic bag` → SW; `electric fan` → APPL; `street sign/pole` → LIGHT; `switch` → WIRE). Same interface as the fine-tuned model, so the swap is a file drop.
- Low confidence (<0.45): sheet offers the top-2 classes as a user pick. Never silently guess.
- Motion: frozen frame as shared element shrinking into the paper header while the sheet rises. One `Animatable` choreography; reduced-motion (`Settings.Global.ANIMATOR_DURATION_SCALE == 0`) → cut.

### Phase 2 — Voice to grievance
- Hold-to-record; waveform from `onRmsChanged` (SpeechRecognizer) or AudioRecord RMS (whisper path).
- Prompt gives the LLM the fixed fields as facts and asks for only `title, body_en, body_local, severity, public_health_flag`. Smaller output = faster + fewer parse failures. Max ~180 output tokens to fit the 12 s budget.
- `JsonRepair`: strip fences → first `{` to last `}` → close unbalanced quotes/braces → lenient parse → per-field validation → per-field template fill. Severity clamped to default ±1, 1..5.
- Serial: `THK-<year>-<6-digit Room autoincrement>`, Plex Mono.
- Record screen: ruled header block, thumbnail tucked in header, classification stamp rotated −6°, rail colour on stamp and primary button. Button: "Send to department" / "Send to electrician" → state "Sent" / "Queued — sends when signal returns".

### Phase 3 — Queue, sync, console
- Room is the source of truth; UI observes Flow. States: `DRAFT → PENDING → TEXT_SENT → PHOTO_SENT`, plus `RESOLVED_CLAIMED`, `VERIFIED`, `REOPENED`.
- `TextSyncWorker`: unique work, `NetworkType.CONNECTED`, expedited, exponential backoff; upsert by serial (idempotent). Also kicked directly by a `ConnectivityManager.NetworkCallback` so the 5-second gate doesn't wait on WorkManager batching.
- `PhotoSyncWorker`: chained after text, `UNMETERED`-preferred, JPEG ≤1280 px q60 → Supabase Storage. Log byte counts for both so the "4 KB vs 3 MB" claim is on-screen evidence.
- Supabase: `tickets` table (schema = ticket JSON + status + weight), `accountability_log`, RLS: anon insert/select only for the hackathon. Keys in `local.properties`, never committed.
- Console: Next.js app router, MapLibre with a free raster style, Supabase realtime subscription, SLA countdown per row, register-red on breach, "Mark resolved" button (needed for the Phase 4 false-closure beat).

### Phase 4 — Proof of Fix
- Geofence (150 m) via `GeofencingClient` needs Play services + background location → high risk; fallback is a "Verify fix" action on the ticket plus a distance check when the app opens.
- Ghost overlay: original frame at 35% alpha over the live preview.
- Verdict = f(classifier on after-frame, cosine distance between penultimate-layer embeddings of before/after):
  - defect class gone (p < 0.25) AND scene similar enough to be the same place (background embedding sim > τ_scene) → `verified fixed`
  - same class present (p > 0.6) → `still present`
  - otherwise (different place, dark, blur) → `inconclusive`, ask for a re-scan
- Console-marked "resolved" + verdict `still present` → `REOPENED` + row in the accountability record (visible in app and console).
- Thresholds tuned on the real planted-trash scene at the venue; stored in one constants file.

### Phase 5 — Collective weight
geohash-7 (~150 m) + same class + embedding cosine > 0.8 → merge locally before upload; bump `signatures`, `weight = signatures × severity`. Console sorts by weight. Theek Score only if hours remain.

### Phase 6 — Hardening
Splash holds until classifier + LLM + ASR are warm; sessions live in an `Application`-scoped holder. Seed three historical tickets (console + device). Scripted demo ×5 cold-start in airplane mode. Grep for `TODO|placeholder|Toast|Log.d` in UI. Loaner-device run.

## 4. Orchestration — three parallel tracks

| Track | Owner | When | Blocks |
|---|---|---|---|
| A. Android app | Claude (main session) | continuous, phases in order | — |
| B. Vision model: shoot dataset (≥150 img/class, real streets), fine-tune MobileNetV3-Small, INT8 export | **You** shoot; Claude writes `ml/train.py` + export + eval during Phase 1 | before the event if possible | Phase 1 gate quality (not plumbing — stub covers that) |
| C. Console + Supabase | Claude sub-agent in parallel with Phase 2, integrated in Phase 3 | from hour ~8 | needs your Supabase project URL + anon key |

Sub-agent use: console scaffold, `ml/` training script, and `JsonRepair` unit tests are independent of the main Android thread and run as background agents; everything touching the device stays in the main session. Each phase ends with report → commit (`Phase N: …`) → stop for your go-ahead.

## 5. What I need from you (in order of urgency)

1. **A phone on USB with debugging enabled** — nothing can pass a gate without it. Tell me its model/RAM.
2. `THEEK_PROJECT_CONTEXT.md` in the repo root (it is missing).
3. Gemma 2 2B IT LiteRT/MediaPipe `.task` file (Kaggle/HF, licence click-through — you must accept it yourself). Pushed to the device via `adb push`, not bundled in the APK (~1.5 GB+).
4. Dataset status for the 8 classes; demo language choice: **Telugu or Hindi** (pick one for Tier 1).
5. Supabase project URL + anon key (you create the account/project; I write the schema SQL).

## 6. Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Offline Telugu/Hindi ASR absent on the iQOO loaner** (Funtouch OS often ships without Google offline packs; packs cannot be downloaded in airplane mode) | High | Probe in Phase 0.5; pre-download packs on Wi-Fi; whisper.cpp tiny/base fallback; Hindi as backup language |
| 2 | Gemma 2B too slow / OOM on loaner | Medium | tok/s probe; Llama 3.2 1B; output capped to 5 short fields; template fallback always present |
| 3 | Gemma weak at Telugu script generation | Medium | `body_local` falls back to cleaned transcript; `body_en` remains the formal document |
| 4 | Fine-tuned classifier under-trained | Medium | 8 classes only, heavy augmentation, top-2 user pick under low confidence |
| 5 | Geofencing unreliable indoors at venue | High | manual "Verify fix" path is primary for the demo |
| 6 | Venue Wi-Fi blocks Supabase realtime | Low-Med | phone hotspot; console polls every 2 s as fallback to websocket |
| 7 | Loaner differs from dev phone (ABI, Android version, permissions UI) | Medium | arm64-only native libs, runtime permission flow tested from clean install, Phase 6 loaner run |

## 7. Judge-readiness kept true throughout
`docs/MODELS.md` (exact files, sources, checksums, `adb push` paths) → reproducibility. `ml/DATASET.md` (self-shot, locations, counts) → grounding. Privacy statement in-app and README: images stay on device until the user sends; text-first sync. `docs/SECOND_COUNTRY.md`: swap `RoutingTable` rows + strings + ASR locale → Nairobi. Three-state verdict → rigor.
