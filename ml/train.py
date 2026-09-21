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

Outputs:  dikhado_cls.tflite  (uint8 in, uint8 out, ~1.5 MB)  and  dikhado_labels.json
Then point MANIFEST in mobile/src/ai/model.ts at them with  outputIsLogits: false  (mean/std unused for uint8).
"""
import argparse
import json
import pathlib

import numpy as np
import tensorflow as tf

SIZE = 224
SEED = 7


def datasets(root: pathlib.Path, batch: int):
    common = dict(image_size=(SIZE, SIZE), batch_size=batch, seed=SEED, validation_split=0.2, label_mode="int")
    train = tf.keras.utils.image_dataset_from_directory(root, subset="training", **common)
    val = tf.keras.utils.image_dataset_from_directory(root, subset="validation", **common)
    return train, val, train.class_names


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

    inputs = tf.keras.Input((SIZE, SIZE, 3))
    x = augment(inputs)
    x = base(x, training=False)
    x = tf.keras.layers.Dropout(0.3)(x)
    outputs = tf.keras.layers.Dense(n_classes, activation="softmax")(x)  # softmax in the graph: the app reads probabilities
    return tf.keras.Model(inputs, outputs), base


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=pathlib.Path, default=pathlib.Path("dataset"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("../mobile/assets/models"))
    ap.add_argument("--epochs-head", type=int, default=12)
    ap.add_argument("--epochs-tune", type=int, default=10)
    ap.add_argument("--batch", type=int, default=32)
    args = ap.parse_args()

    tf.keras.utils.set_random_seed(SEED)
    train, val, classes = datasets(args.data, args.batch)
    print("classes:", classes)
    counts = {c: len(list((args.data / c).glob("*"))) for c in classes}
    print("images per class:", counts)
    if min(counts.values()) < 60:
        print("WARNING: fewer than 60 images in some class - expect it to be unreliable. Aim for 150+.")

    # Classes are never balanced in a self-shot set; weight them so the rare ones are not ignored.
    total = sum(counts.values())
    class_weight = {i: total / (len(classes) * counts[c]) for i, c in enumerate(classes)}

    train = train.prefetch(tf.data.AUTOTUNE)
    val = val.prefetch(tf.data.AUTOTUNE)
    model, base = build(len(classes))
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
    export = tf.keras.Model(model.input, model.output)

    def representative():
        for images, _ in train.unbatch().batch(1).take(200):
            yield [tf.cast(images, tf.float32)]

    conv = tf.lite.TFLiteConverter.from_keras_model(export)
    conv.optimizations = [tf.lite.Optimize.DEFAULT]
    conv.representative_dataset = representative
    conv.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    conv.inference_input_type = tf.uint8
    conv.inference_output_type = tf.uint8
    blob = conv.convert()

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "dikhado_cls.tflite").write_bytes(blob)
    # "dikhado:<category>[/<problem>]" - the app routes on these directly (src/ai/labelMap.ts).
    labels = ["dikhado:" + c.replace("__", "/") for c in classes]
    (args.out / "dikhado_labels.json").write_text(json.dumps(labels))
    print(f"\nwrote {len(blob) / 1e6:.2f} MB model and {len(labels)} labels to {args.out}")

    # The quantised model is what ships: check it, not just the float one.
    interp = tf.lite.Interpreter(model_content=blob)
    interp.allocate_tensors()
    i_in, i_out = interp.get_input_details()[0]["index"], interp.get_output_details()[0]["index"]
    hits = n = 0
    for images, labels_batch in val.unbatch().batch(1).take(300):
        interp.set_tensor(i_in, tf.cast(images, tf.uint8).numpy())
        interp.invoke()
        hits += int(np.argmax(interp.get_tensor(i_out)[0]) == int(labels_batch.numpy()[0]))
        n += 1
    print(f"INT8 validation accuracy: {hits / max(n, 1):.3f} on {n} images")


if __name__ == "__main__":
    main()
