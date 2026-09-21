import { Asset } from 'expo-asset';
import { loadTensorflowModel, type TfliteModel } from 'react-native-fast-tflite';
import type { Classify } from './diagnose';

/**
 * The on-device classifier. One model, loaded once, kept for the life of the process.
 *
 * Model: MobileNetV3-Small 1.0 224 (ImageNet), float32, published by Google on Kaggle Models,
 * Apache-2.0. Input 1x224x224x3 in [0,1]; output 1x1001 logits, index 0 = "background".
 * See docs/MODELS.md for source URL and checksum. A fine-tuned DikhaDo model is a file swap:
 * change `MANIFEST` and nothing else.
 */
const MANIFEST = {
  file: require('../../assets/models/mobilenet_v3_small_224_cls.tflite') as number,
  labels: require('../../assets/models/imagenet_labels.json') as string[],
  /** float input = (byte - mean) / std. This model wants [0,1]. Not discoverable from the file; recorded here. */
  mean: 0,
  std: 255,
  outputIsLogits: true,
};

export const INPUT_SIZE = 224;

type Loaded = { model: TfliteModel; inType: string; outType: string; size: number };
export type AiStatus = 'loading' | 'ready' | 'failed';

let loading: Promise<Loaded> | null = null;
let status: AiStatus = 'loading';
let warmMs: number | null = null;
const listeners = new Set<(s: AiStatus) => void>();

function setStatus(next: AiStatus) {
  status = next;
  listeners.forEach((fn) => fn(next));
}

export const aiStatus = () => status;
export const aiWarmMs = () => warmMs;
export function onAiStatus(fn: (s: AiStatus) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Start loading now (called behind the splash) so nobody ever watches a model load.
 * Also the capability probe: if the model cannot load on this phone, the app runs in Simple mode.
 */
export function warmUp(): Promise<Loaded> {
  if (loading) return loading;
  loading = (async () => {
    // expo-asset copies the bundled model to a real file:// path. fast-tflite's own require()
    // path only works while Metro serves it over http, and would fail in a release APK.
    const asset = await Asset.fromModule(MANIFEST.file).downloadAsync();
    if (!asset.localUri) throw new Error('model asset has no local file');
    const model = await loadTensorflowModel({ url: asset.localUri }, []); // [] = CPU: the right choice for a small model on cheap phones

    const input = model.inputs[0];
    const output = model.outputs[0];
    if (!input || !output) throw new Error('model has no input or output tensor');
    const [n, h, w, c] = input.shape;
    if (input.shape.length !== 4 || n !== 1 || h !== w || c !== 3) throw new Error(`unexpected input shape ${JSON.stringify(input.shape)}`);
    if (input.dataType !== 'uint8' && input.dataType !== 'float32') throw new Error(`unsupported input type ${input.dataType}`);
    const loaded: Loaded = { model, inType: input.dataType, outType: output.dataType, size: h };

    // First inference pays one-time costs; pay them now, on a blank frame, not on the user's first photo.
    const started = Date.now();
    await run(loaded, new Uint8Array(h * w * 3));
    warmMs = Date.now() - started;
    return loaded;
  })();
  loading.then(
    () => setStatus('ready'),
    () => {
      loading = null;
      setStatus('failed');
    },
  );
  return loading;
}

// The interpreter has no lock and run() executes on a thread pool: calls are serialised here.
let chain: Promise<unknown> = Promise.resolve();

async function run(m: Loaded, rgb: Uint8Array): Promise<Float32Array> {
  let input: ArrayBuffer;
  if (m.inType === 'uint8') {
    input = rgb.slice().buffer; // exactly sized, zero offset: native copies the whole buffer and ignores a size mismatch
  } else {
    const f = new Float32Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) f[i] = (rgb[i] - MANIFEST.mean) / MANIFEST.std;
    input = f.buffer;
  }
  const [out] = await m.model.run([input]);
  if (!out) throw new Error('model returned no output');
  // Copy at once: the native output buffer is reused by the next run().
  if (m.outType === 'float32') return new Float32Array(out.slice(0));
  if (m.outType === 'uint8') return Float32Array.from(new Uint8Array(out), (v) => v / 255);
  throw new Error(`unsupported output type ${m.outType}`);
}

function softmax(logits: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  let sum = 0;
  const out = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) sum += out[i] = Math.exp(logits[i] - max);
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

/** 224x224 RGB bytes in, label probabilities out. Entirely on the phone. */
export const classify: Classify = (rgb) => {
  const job = chain.then(async () => {
    const m = await warmUp();
    if (rgb.length !== m.size * m.size * 3) throw new Error(`expected ${m.size}x${m.size} RGB, got ${rgb.length} bytes`);
    const raw = await run(m, rgb);
    const probabilities = MANIFEST.outputIsLogits && m.outType === 'float32' ? softmax(raw) : raw;
    return { labels: MANIFEST.labels, probabilities };
  });
  chain = job.catch(() => {});
  return job;
};
