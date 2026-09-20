# Theek

*Point it. Get it theek.*

Offline-first, on-device-AI Android app for civic and repair reporting. One camera, one tap, two rails: a public grievance to a department, or a private job card to a local worker. Every inference runs on the phone; the app works in airplane mode.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for architecture, phases, risks and cut lines.

## Build

Requirements: JDK 17, Android SDK platform 35. `JAVA_HOME` must point at JDK 17 (AGP refuses Java 11).

```bash
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.theek.app/.MainActivity
```

Model binaries are never committed. From Phase 1 onward, `docs/MODELS.md` lists each file, its source, checksum and `adb push` path.

## Privacy

No image leaves the device until the user sends a ticket. The text ticket syncs first and alone; the photo follows later, compressed. No photo, audio or transcript is ever sent to a third-party AI service — there is none in the pipeline.

## Status

| Phase | State |
|---|---|
| 0 Scaffold: theme tokens, bundled type, navigation, placeholders | built |
| 0.5 Device probe | next — needs the phone |
| 1–6 | not started |

Fonts: IBM Plex Sans / Sans Devanagari / Mono and Noto Sans Telugu, all SIL OFL 1.1, bundled in `app/src/main/res/font`.
