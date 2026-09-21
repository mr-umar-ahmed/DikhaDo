# On-device models

Every model DikhaDo uses runs on the phone. None is fetched at runtime; none sends data anywhere. This file records where each came from so the build is reproducible.

## 1. Problem classifier (shipping, day-one)

| | |
|---|---|
| File | `mobile/assets/models/mobilenet_v3_small_224_cls.tflite` (10,209,756 bytes) |
| SHA-256 | `9df60af7ab24d287a54668e845ea7da1c854086b828a4a4cf46c55c403095053` |
| What | MobileNetV3-Small 1.0 224, ImageNet classification, float32 |
| Publisher / licence | Google, via Kaggle Models (the migrated TF Hub) · Apache-2.0 |
| Source | `https://www.kaggle.com/api/v1/models/google/mobilenet-v3/tfLite/small-100-224-classification/1/download` (tar.gz containing `1.tflite`) |
| Input | `1×224×224×3` float32, RGB, values in **[0, 1]** (`byte / 255`) |
| Output | `1×1001` **logits** (softmax applied in `src/ai/model.ts`); index 0 = `background` |
| Labels | `mobile/assets/models/imagenet_labels.json`, from `https://storage.googleapis.com/download.tensorflow.org/data/ImageNetLabels.txt` (1001 lines) |
| Measured | 72 ms per photo on a Redmi Note 13 Pro+ (CPU, dev build), model warmed behind the splash |

Re-fetch:

```bash
cd mobile && mkdir -p assets/models
curl -L --fail -o m.tar.gz "https://www.kaggle.com/api/v1/models/google/mobilenet-v3/tfLite/small-100-224-classification/1/download"
tar -xzf m.tar.gz -C assets/models && mv assets/models/1.tflite assets/models/mobilenet_v3_small_224_cls.tflite && rm m.tar.gz
sha256sum assets/models/mobilenet_v3_small_224_cls.tflite
```

Why this one: about a tenth of the multiply-adds of MobileNetV1 (≈ 56 M vs ≈ 569 M), so it stays fast on low-end CPUs, and it has a sibling feature-vector model with the same input for Proof of Work. The older official `storage.googleapis.com/mobilenet_v3/...` URLs now return 403.

**How ImageNet becomes a repair diagnosis:** `src/ai/labelMap.ts` maps ~90 everyday-object labels onto catalog categories and adds their probabilities; anything else is ignored. When the phone is not sure it says so and offers its guesses, or sends the user to the picture grid. It never forces an answer.

## 2. Fine-tuned DikhaDo classifier (planned drop-in)

Trained by `ml/train.py` on a self-shot dataset (Indian switchboards, ceiling and table fans, taps, pump sets, two-wheelers, furniture, garbage). Same 224×224 input; labels are catalog codes, so `labelMap.ts` is bypassed. Swapping it in is a change to `MANIFEST` in `src/ai/model.ts` and nothing else.

## 3. Image embeddings for Proof of Work (Phase 7)

MobileNetV3-Small feature vector, `1×1024` output, same preprocessing: `https://www.kaggle.com/api/v1/models/google/mobilenet-v3/tfLite/small-100-224-feature-vector/1/download` (6,105,072 bytes, Apache-2.0). Not yet in the repo.

## 4. Optional text model (Phase 8)

A small GGUF language model pushed to the phone with `adb`, never bundled and never committed. Templates do the same job on every phone without it.

## Integration notes (verified against installed sources — see `docs/research-phase3-apis.json`)

- `react-native-fast-tflite` 3 loads a `require()`d asset through a URL that only exists while Metro serves it; in a release APK that fails. We copy the asset to a real file with `expo-asset` and load `{ url: file://… }` — identical in dev and release.
- `model.run()` takes `ArrayBuffer[]`, copies the whole buffer, and ignores a size mismatch silently: inputs are always freshly allocated at the exact size. The output buffer is reused by the next run, so it is copied at once. Calls are serialised in JS because the interpreter has no lock.
- `react-native-vision-camera` 5 has no `takePhoto()`; capture is `usePhotoOutput().capturePhoto(settings, callbacks)`. `photo.toImageAsync()` returns an upright `react-native-nitro-image` bitmap; pixels arrive as RGBA on Android. Every native bitmap is disposed in a `finally`.
- CPU only. The GPU delegate would need a manifest entry and a native rebuild, and gains nothing for a model this small.
- `react-native-fast-tflite` requires Android 8.0+ (minSdk 26).
