# Training the DikhaDo classifier

The app ships with a stock ImageNet MobileNetV3-Small and a label map (`mobile/src/ai/labelMap.ts`). That is good at fans, fridges, scooters and bins, and weak at exactly the things rural homes break most: **switchboards, loose wiring, taps, pump sets**. This folder turns your own photos into a model that knows them.

> Status: `train.py` is written but has **not been run yet** — it needs the dataset below, and TensorFlow needs Python 3.10–3.12 (this machine has 3.14).

## 1. Shoot the dataset

Real homes, real streets, the phone you will demo with. Stock photos teach the model stock photos.

- **150+ photos per class** (60 is the floor). One folder per class — names are in the header of `train.py`.
- Vary everything that varies in the field: distance (close-up and across the room), angle, daylight / tube light / evening, clean and grimy, working and broken.
- Same object from 5 angles is 1 object, not 5. Walk to the next house.
- **Fill `other/` generously** (walls, floors, faces, fields, sky, food). It is what lets the phone say "I cannot tell" instead of inventing a repair.
- No faces, number plates or house numbers in anything you publish. The training photos stay on your machine; only the model is committed.

Record what you shot in `DATASET.md` (where, how many, which phone) — judges ask.

## 2. Train and export

```bash
python -m venv .venv && .venv/Scripts/activate      # Python 3.10-3.12
pip install -r requirements.txt
python train.py --data dataset --out ../mobile/assets/models
```

About 10 minutes on a laptop CPU. It prints accuracy **per class** and then the accuracy of the quantised model that actually ships. If a class is under 0.8, shoot more of it rather than training longer.

## 3. Drop it into the app

In `mobile/src/ai/model.ts` change `MANIFEST` to:

```ts
file: require('../../assets/models/dikhado_cls.tflite'),
labels: require('../../assets/models/dikhado_labels.json'),
mean: 0, std: 1,          // unused: the model takes raw uint8 pixels
outputIsLogits: false,    // softmax is inside the graph
```

Nothing else changes. Labels look like `dikhado:electrical/switchboard`, which the app routes on directly; `dikhado:other` is ignored. Reload the app — no native rebuild.
