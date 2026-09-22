# DikhaDo

*Dikha do. Theek ho jayega.* — Just show it. It gets fixed.

A rural-first worker marketplace for India. Show the broken thing to the camera — or say it, or tap a picture — and **the phone itself** names the problem, shows a fair price range, and lists trusted workers who are on duty nearby. The job then runs live between two phones: request → accept → on the way → done → pay by UPI or cash → rate. It works with AI switched off, on cheap phones, and on one bar of signal. Public problems (a garbage heap, an open drain) go to the panchayat instead, with a deadline and a citizen's power to check the fix.

Every AI feature runs **on the device**. There is no cloud AI, no API key, and no paid service anywhere in this repository.

- **[PLAN.md](PLAN.md)** — the problem, the local-AI layer, architecture, every phase and its gate
- **[PROGRESS.md](PROGRESS.md)** — dated log of what landed, how it was verified, what is still open
- **[docs/MODELS.md](docs/MODELS.md)** — model provenance, checksums, integration notes
- **[docs/SECOND_COUNTRY.md](docs/SECOND_COUNTRY.md)** — taking this to another country is a data change, not a rewrite
- `docs/review-phase2.json`, `docs/review-phase3.json` — adversarially verified code reviews, and what was fixed

## What is in here

| Path | What |
|---|---|
| `mobile/` | The app: Expo SDK 57, React Native 0.86, TypeScript, expo-router |
| `mobile/src/ai/` | The on-device AI layer: vision model, photo quality gate, label map, safety table, speech intent, scene signatures and Proof of Fix |
| `mobile/scripts/` | `lifecycle-test.mjs` (33 backend checks) · `ai-test.ts` (48 AI unit checks) · `demo-bot.mjs` (the laptop plays the seeded workers) · `seed-demo.mjs` (a believable morning of history) |
| `supabase/` | Postgres + PostGIS schema: matching, triggers, transition guards, civic routing table; seed data |
| `console/` | Department Console — a static page, no build step: live map, jobs, verification queue, panchayat reports |
| `ml/` | Training pipeline for your own photos → INT8 / FP16 `.tflite`, with measured accuracy |

## Run it

**Requirements:** Node 20+, JDK 17 (`JAVA_HOME` must point at it), Android SDK, a phone with USB debugging.

```bash
cd mobile
npm install
cp .env.example .env          # then fill in your Supabase URL and anon key
npx expo prebuild -p android
npx expo run:android          # first native build ~15 min; afterwards: npx expo start --dev-client
```

> **Windows:** build from a short real path such as `C:\dk`. A deep folder (OneDrive, Desktop) breaks the 260-character limit in the C++ build, and a `subst` drive does not help because Node resolves it back to the long path. Xiaomi phones need *Developer options → Install via USB*.

**Release APK** (no laptop needed afterwards):

```bash
cd mobile/android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
adb install -r app/build/outputs/apk/release/app-release.apk
```

## Backend

Create a free Supabase project. In the SQL editor run, in order: `supabase/migrations/0001_init.sql`, `supabase/seed.sql` (once), `0002_request_latlng.sql`, `0003_guards_presence_ranking.sql`, `0004_media_trust_civic.sql`.

```bash
cd mobile
node scripts/lifecycle-test.mjs                 # 33 checks against the live backend, cleans up after itself
node scripts/seed-demo.mjs 17.4474,78.3762      # finished jobs + panchayat reports around this point
node scripts/demo-bot.mjs --here 17.4474,78.3762   # move the 12 seeded workers here and answer requests for them
npx tsx scripts/ai-test.ts                      # 48 unit checks of the on-device AI logic, no phone needed
```

## Console

**Live demo:** https://dikhado-console.netlify.app — the deployed console, reading the real production database (workers, jobs, panchayat reports). Add `?tab=civic`, `?tab=workers` or `?tab=verify` to open straight into that tab.

```bash
cd console
cp config.example.js config.js    # fill in the same Supabase URL and anon key
python -m http.server 5050        # then open http://127.0.0.1:5050
```

Redeploy after a console change: `cd console && npx netlify-cli deploy --dir=. --prod` (see `console/netlify.toml`).

## The 90-second demo

1. Airplane mode on. Point at a dead fan, tap once: **Fan not working, ₹150–300, "Checked on this phone. No internet used."**, read aloud.
2. Network on. Verified workers nearby, nearest-and-most-trusted first. **Request Ramesh.** (`demo-bot.mjs` answers for him, or use a second phone as the worker.)
3. Accept → on the way → working → done ₹250. **Pay with UPI** opens the UPI app. Rate. **Share the receipt.**
4. On the laptop: the console's map, the job, the day's earnings ticking up.
5. Same camera at a garbage heap: **Report it to the panchayat.** The ticket lands on the console with its deadline running. Mark it resolved on the laptop, re-scan on the phone: **"The phone still sees the problem" → No, it is still there** → the ticket reopens and the false closure is on the record.

## Privacy

Photos and speech are analysed on the phone. A photo or voice note leaves the device only as part of a job or report the user sends, and only to this project's own storage — never to a third-party AI service. Worker ID documents go to a private bucket read through short-lived links. The open row-level-security and storage policies in the migrations are for the hackathon demo and are marked as such in the SQL.

## Licences

Fonts: IBM Plex Sans / Sans Devanagari / Mono and Noto Sans Telugu, SIL OFL 1.1. Vision model: MobileNetV3-Small by Google, Apache-2.0 (see `docs/MODELS.md`). Map tiles: © OpenStreetMap contributors.
