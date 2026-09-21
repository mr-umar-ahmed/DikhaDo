"""
Fine-tune MobileNetV3-Small on self-shot photos and export an INT8 .tflite for the DikhaDo app.

    pip install -r requirements.txt          # Python 3.10-3.12 (TensorFlow has no 3.13+ wheels yet)
    python train.py --data dataset --out ../mobile/assets/models

Dataset layout - one folder per class, the folder name IS the routing:

    dataset/
      appliance__fan_dead/      ceiling + table fans                 -> category appliance, problem fan_dead
      appliance/                coolers, fridges, mixers, TVs        -> category appliance (user picks the problem)
      electrical__switchboard/  switchboards, sockets, MCB boxes
      electrical__wiring_fault/ loose / burnt / hanging wiring
      plumbing__tap_leak/       taps, pipes, leaks
      pump__pump_dead/          pump sets, tubewell motors, starters
      carpentry/                doors, cots, chairs, shelves
      mechanic/                 two-wheelers, tractors, cycles
      waste__bulk_waste/        garbage heaps, overflowing bins
      other/                    walls, floors, people, sky - anything that is NOT a job

`other` matters: without it the model must call every photo *something*. The app ignores it.

Outputs:  dikhado_cls_int8.tflite (~1.2 MB), dikhado_cls_fp16.tflite (~2 MB) and dikhado_labels.json.
Both are measured on the validation photos and the script says which one to ship.
Then point MANIFEST in mobile/src/ai/model.ts at it with  mean: 0, std: 1, outputIsLogits: false.
"""
import argparse
import json
import pathlib
import tempfile

import numpy as np
import tensorflow as tf

SIZE = 224
SEED = 7


def load(path, label):
    """Decode exactly the way the app sees a photo: centre-crop to a square, then resize. No stretching."""
    img = tf.io.decode_jpeg(tf.io.read_file(path), channels=3)
    shape = tf.shape(img)
    side = tf.minimum(shape[0], shape[1])
    img = tf.image.resize_with_crop_or_pad(img, side, side)
    img = tf.image.resize(img, (SIZE, SIZE), antialias=True)
    return img, label  # float32, 0-255


def datasets(root: pathlib.Path, batch: int):
    classes = sorted(d.name for d in root.iterdir() if d.is_dir())
    train_items, val_items, counts = [], [], {}
    for i, c in enumerate(classes):
        files = sorted(f for f in (root / c).iterdir() if f.suffix.lower() in (".jpg", ".jpeg"))
        counts[c] = len(files)
        # Dataset-mode filenames are capture timestamps, and one object is shot several times in a row.
        # A random split would put near-identical shots on both sides and flatter every number below.
        # Holding out the LAST 20% of each class validates on objects the model never trained on.
        cut = max(1, int(len(files) * 0.8))
        train_items += [(str(f), i) for f in files[:cut]]
        val_items += [(str(f), i) for f in files[cut:]]

    def make(items, shuffle):
        paths, labels = zip(*items)
        ds = tf.data.Dataset.from_tensor_slices((list(paths), list(labels)))
        if shuffle:
            ds = ds.shuffle(len(items), seed=SEED, reshuffle_each_iteration=True)
        return ds.map(load, num_parallel_calls=tf.data.AUTOTUNE).batch(batch)

    return make(train_items, True), make(val_items, False), classes, counts


def build(n_classes: int) -> tf.keras.Model:
    # Phones in the field: bad light, odd angles, motion, cheap lenses. Train for that, not for a studio.
    augment = tf.keras.Sequential(
        [
            tf.keras.layers.RandomFlip("horizontal"),
            tf.keras.layers.RandomRotation(0.08),
            tf.keras.layers.RandomZoom((-0.25, 0.1)),
            tf.keras.layers.RandomTranslation(0.1, 0.1),
            tf.keras.layers.RandomBrightness(0.35),
            tf.keras.layers.RandomContrast(0.35),
        ],
        name="augment",
    )
    # include_preprocessing=True: the network takes raw 0-255 pixels, which is what a uint8 input tensor carries.
    base = tf.keras.applications.MobileNetV3Small(
        input_shape=(SIZE, SIZE, 3), include_top=False, weights="imagenet", pooling="avg", include_preprocessing=True
    )
    base.trainable = False

    head = tf.keras.layers.Dense(n_classes, activation="softmax")  # softmax in the graph: the app reads probabilities

    inputs = tf.keras.Input((SIZE, SIZE, 3))
    x = augment(inputs)
    x = base(x, training=False)
    x = tf.keras.layers.Dropout(0.3)(x)
    trainer = tf.keras.Model(inputs, head(x))

    # What ships: the same weights with no augmentation and no dropout in the graph.
    clean = tf.keras.Input((SIZE, SIZE, 3))
    shipped = tf.keras.Model(clean, head(base(clean, training=False)))
    return trainer, shipped, base


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=pathlib.Path, default=pathlib.Path("dataset"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("../mobile/assets/models"))
    ap.add_argument("--epochs-head", type=int, default=12)
    ap.add_argument("--epochs-tune", type=int, default=10)
    ap.add_argument("--batch", type=int, default=32)
    args = ap.parse_args()

    tf.keras.utils.set_random_seed(SEED)
    train, val, classes, counts = datasets(args.data, args.batch)
    print("classes:", classes)
    print("images per class:", counts, "(last 20% of each, by capture time, held out for validation)")
    if min(counts.values()) < 60:
        print("WARNING: fewer than 60 images in some class - expect it to be unreliable. Aim for 150+.")

    # Classes are never balanced in a self-shot set; weight them so the rare ones are not ignored.
    total = sum(counts.values())
    class_weight = {i: total / (len(classes) * counts[c]) for i, c in enumerate(classes)}

    train = train.prefetch(tf.data.AUTOTUNE)
    val = val.prefetch(tf.data.AUTOTUNE)
    model, shipped, base = build(len(classes))
    stop = tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=4, restore_best_weights=True)

    # 1) train the new head on frozen ImageNet features
    model.compile(tf.keras.optimizers.Adam(1e-3), "sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(train, validation_data=val, epochs=args.epochs_head, class_weight=class_weight, callbacks=[stop])

    # 2) unfreeze the top of the backbone at a low rate (batch-norm stays in inference mode via training=False above)
    base.trainable = True
    for layer in base.layers[:-40]:
        layer.trainable = False
    model.compile(tf.keras.optimizers.Adam(1e-5), "sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(train, validation_data=val, epochs=args.epochs_tune, class_weight=class_weight, callbacks=[stop])

    # Per-class report: overall accuracy hides the one class that fails on stage.
    y_true, y_pred = [], []
    for images, labels in val:
        y_true.extend(labels.numpy())
        y_pred.extend(np.argmax(model.predict(images, verbose=0), axis=1))
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    print("\nvalidation accuracy per class")
    for i, c in enumerate(classes):
        mask = y_true == i
        print(f"  {c:28s} {(y_pred[mask] == i).mean() if mask.any() else float('nan'):.2f}  (n={mask.sum()})")

    # Full-integer quantisation, calibrated on real training photos (without augmentation).
    def representative():
        for images, _ in train.unbatch().batch(1).take(200):
            yield [tf.cast(images, tf.float32)]

    # Keras 3 (TF 2.16+) breaks TFLiteConverter.from_keras_model; go through a SavedModel instead.
    saved = tempfile.mkdtemp(prefix="dikhado_saved_")
    shipped.export(saved)

    def convert(kind: str) -> bytes:
        conv = tf.lite.TFLiteConverter.from_saved_model(saved)
        conv.optimizations = [tf.lite.Optimize.DEFAULT]
        if kind == "int8":  # smallest and fastest; uint8 in, uint8 out
            conv.representative_dataset = representative
            conv.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
            conv.inference_input_type = tf.uint8
            conv.inference_output_type = tf.uint8
        else:  # float16 weights; float32 in (raw 0-255), float32 probabilities out
            conv.target_spec.supported_types = [tf.float16]
        return conv.convert()

    def accuracy(blob: bytes) -> tuple[float, int]:
        interp = tf.lite.Interpreter(model_content=blob)
        interp.allocate_tensors()
        inp, out = interp.get_input_details()[0], interp.get_output_details()[0]
        hits = n = 0
        for images, labels_batch in val.unbatch().batch(1).take(400):
            interp.set_tensor(inp["index"], tf.cast(images, inp["dtype"]).numpy())
            interp.invoke()
            hits += int(np.argmax(interp.get_tensor(out["index"])[0]) == int(labels_batch.numpy()[0]))
            n += 1
        return hits / max(n, 1), n

    args.out.mkdir(parents=True, exist_ok=True)
    # "dikhado:<category>[/<problem>]" - the app routes on these directly (src/ai/labelMap.ts).
    labels = ["dikhado:" + c.replace("__", "/") for c in classes]
    (args.out / "dikhado_labels.json").write_text(json.dumps(labels))

    # MobileNetV3 (hard-swish, squeeze-excite) can lose real accuracy under full-integer quantisation.
    # Export both, measure both on the validation photos, and let the numbers choose what ships.
    results = {}
    for kind in ("int8", "fp16"):
        blob = convert(kind)
        (args.out / f"dikhado_cls_{kind}.tflite").write_bytes(blob)
        acc, n = accuracy(blob)
        results[kind] = acc
        print(f"{kind:5s} {len(blob) / 1e6:5.2f} MB   validation accuracy {acc:.3f} on {n} images")

    pick = "int8" if results["int8"] >= results["fp16"] - 0.02 else "fp16"
    print()
    print(f"ship: dikhado_cls_{pick}.tflite  ({len(labels)} labels in dikhado_labels.json)")
    print("MANIFEST in mobile/src/ai/model.ts ->  mean: 0, std: 1, outputIsLogits: false  (same for both files)")


if __name__ == "__main__":
    main()
