# DikhaDo

*Dikha do. Theek ho jayega.* — Just show it. It gets fixed.

A rural-first worker marketplace for India. Show the broken thing to the camera; a small on-device model names the problem; the app lists trusted workers who are on duty nearby, with a price range, before you ever make a call. Works with AI switched off, on cheap phones, on weak signal. Civic reporting ("Report to panchayat") and before/after Proof of Work ride on the same camera as extras.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for research, product, architecture, phases and risks.

## Layout

| Path | What |
|---|---|
| `mobile/` | Expo (React Native, TypeScript) app |
| `supabase/` | Postgres + PostGIS schema, matching function, seed data |
| `console/` | Web console (Phase 4) |
| `ml/` | Vision model training and export (Phase 3) |

The original Kotlin scaffold is preserved on the `kotlin-scaffold` branch.

## Run the app

Requirements: Node 20+, JDK 17 (`JAVA_HOME` must point at it), Android SDK.

```bash
cd mobile
npm install
npx expo prebuild -p android
npx expo run:android
```

**Windows path limit:** the native C++ build fails with "Filename longer than 260 characters" when the repo sits in a deep folder (it does, under OneDrive). Build from a short drive letter instead — no admin rights needed, mapping lasts until reboot:

```bash
subst T: "C:\Users\DELL\OneDrive\Desktop\PROJECTS\THEEK"
```

then run the commands above from `T:\mobile`. Moving the repo to something like `C:\dev\dikhado` (outside OneDrive, which also stops it syncing `node_modules`) fixes this permanently.

After the first native build, day-to-day work only needs `npx expo start` with the installed dev build.

## Backend

Create a free Supabase project, run `supabase/migrations/0001_init.sql` then `supabase/seed.sql` in the SQL editor, and copy `mobile/.env.example` to `mobile/.env` with the project URL and anon key. Set the demo centre coordinates at the top of the seed's worker block to the venue.

## Privacy

Photos are classified on the phone. A photo leaves the device only as part of a job the user chooses to send, and only to the project's own storage — never to a third-party AI service. The open row-level-security policy in the migration is for the hackathon demo only and is marked as such.

## Status

| Phase | State |
|---|---|
| 0 Scaffold: tokens, bundled type, en/hi/te, role picker, schema + seed | built |
| 1 Directory spine (no AI) | next |
| 2–7 | not started |

Fonts: IBM Plex Sans / Sans Devanagari / Mono and Noto Sans Telugu, SIL OFL 1.1.
