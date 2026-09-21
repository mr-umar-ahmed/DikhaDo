# Training the DikhaDo classifier

The app ships with a stock ImageNet MobileNetV3-Small and a label map (`mobile/src/ai/labelMap.ts`). On the demo phone it already recognises switchboards, appliances and furniture. Your own photos make it reliable on the things rural homes actually break — Indian switchboards and wiring, taps, pump sets, coolers — and teach it to say "I cannot tell" instead of guessing.

> Status: the pipeline is **verified end to end** on a synthetic dataset (train → export → measure, TensorFlow 2.16.2, Python 3.12 venv in `ml/.venv`). It has not yet been run on real photos — that is the step below.

## 1. Shoot the dataset — with the app itself

No file copying, no renaming. The debug build has a **Dataset mode**:

1. Open DikhaDo → on the first screen (language / role), tap **Dataset mode (developer)** at the bottom. If you are already past that screen, use *Change how you use the app* to get back.
2. Pick a class chip at the top (it shows how many you have). The line above the shutter says what belongs in it.
3. Tap the big amber button. It counts up towards 150. Each tap saves one upright 640 px photo on the phone.
4. Walk. New object every 3–5 shots.

What makes a good set:

- **150+ per class; 60 is the floor.** A chip turns green-edged at 150.
- Vary what varies in the field: distance (close-up and across the room), angle, daylight / tube light / evening, clean and grimy, working and broken.
- The same fan from 5 angles is *one* fan. Go to the next house, shop, street.
- **Fill `other` generously** — walls, floors, fields, sky, food, animals, vehicles far away. It is what lets the phone admit it does not know. Make it your biggest class.
- `electrical / wiring_fault` is the hard one: loose wires, burnt sockets, taped joints, hanging meter-board wiring. Do not touch anything live to stage a photo.
- No faces, number plates or house numbers. Photos stay on your phone and laptop; only the trained model is committed (`ml/dataset/` is git-ignored).

Two hours of walking around a neighbourhood is enough for a first model. Write where and what you shot in `DATASET.md` — judges ask about real-world grounding.

## 2. Pull the photos to the laptop

```bash
bash ml/pull_dataset.sh
```

Phone on USB. Prints the count per class. Safe to re-run as you shoot more.

## 3. Train

```bash
cd ml
.venv/Scripts/python.exe train.py --data dataset --out ../mobile/assets/models
```

About 10 minutes on the laptop CPU. It prints accuracy **per class**, then exports two models and measures both on your validation photos:

```
int8   1.22 MB   validation accuracy 0.xxx
fp16   1.91 MB   validation accuracy 0.xxx
ship: dikhado_cls_fp16.tflite
```

MobileNetV3 can lose real accuracy under full-integer quantisation (in the smoke test: 1.00 → 0.67), so the script lets the numbers choose; float16 is usually the one to ship, and at 1.9 MB it is still five times smaller than the stock model. If any class is under 0.8, shoot more of that class rather than training longer.

## 4. Drop it into the app

In `mobile/src/ai/model.ts` change `MANIFEST` to:

```ts
file: require('../../assets/models/dikhado_cls_fp16.tflite'),   // or _int8
labels: require('../../assets/models/dikhado_labels.json'),
mean: 0, std: 1,          // the network takes raw 0-255 pixels
outputIsLogits: false,    // softmax is inside the graph
```

Nothing else changes: labels look like `dikhado:electrical/switchboard` and the app routes on them directly; `dikhado:other` is ignored. Reload the app — no native rebuild. Then re-run the airplane-mode snap test.

## Fresh machine

```bash
py -3.12 -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt
```

TensorFlow supports Python 3.10–3.12 only.
