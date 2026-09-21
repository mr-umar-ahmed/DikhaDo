// Unit checks for the pure parts of the local AI layer. No phone, no model, no network.
//   cd mobile && npx tsx scripts/ai-test.ts
import { diagnose, type Classify } from '../src/ai/diagnose';
import { hitForLabel, scoreCategories } from '../src/ai/labelMap';
import { assessQuality } from '../src/ai/quality';
import { safetyFor } from '../src/ai/safety';
import { byCode } from '../src/data/catalog';
import shipped from '../assets/models/imagenet_labels.json';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ── label map ────────────────────────────────────────────────────────────────
check('electric fan -> appliance / fan_dead', hitForLabel('electric fan, blower')?.problem === 'fan_dead');
check('switch -> electrical / switchboard', hitForLabel('switch, electric switch, electrical switch')?.problem === 'switchboard');
check('ashcan -> waste', hitForLabel('ashcan, trash can, garbage can, wastebin')?.category === 'waste');
check('tractor -> mechanic', hitForLabel('tractor')?.category === 'mechanic');
check('washbasin -> plumbing', hitForLabel('washbasin, handbasin, washbowl')?.category === 'plumbing');
check('word boundaries: "desktop computer" is not a desk', hitForLabel('desktop computer') === null);
check('word boundaries: "gridiron" is not an iron', hitForLabel('gridiron') === null);
check('an unrelated label maps to nothing', hitForLabel('golden retriever') === null);
const own = hitForLabel('dikhado:electrical/switchboard');
check('fine-tuned labels route directly', own?.category === 'electrical' && own?.problem === 'switchboard');
check('fine-tuned label without a problem', hitForLabel('dikhado:carpentry')?.category === 'carpentry' && hitForLabel('dikhado:carpentry')?.problem === undefined);
check('the fine-tuned "other" class maps to nothing', hitForLabel('dikhado:other') === null);

// The labels that actually ship are the SHORT form ("bucket", not "bucket, pail"). Test against the real file.
const routes = (label: string) => {
  if (!(shipped as string[]).includes(label)) return `<"${label}" is not in the shipped label file>`;
  const h = hitForLabel(label);
  return h ? `${h.category}${h.problem ? '/' + h.problem : ''}` : '<none>';
};
for (const [label, want] of [
  ['electric fan', 'appliance/fan_dead'], ['switch', 'electrical/switchboard'], ['washbasin', 'plumbing/tap_leak'],
  ['tub', 'plumbing/tap_leak'], ['bucket', 'plumbing/tap_leak'], ['barrel', 'plumbing/tank_overflow'],
  ['file', 'carpentry'], ['cab', 'mechanic'], ['ashcan', 'waste/bulk_waste'], ['tractor', 'mechanic'],
  ['carton', '<none>'], ['packet', '<none>'], ['hand blower', 'appliance'],
] as const) check(`shipped label "${label}" -> ${want}`, routes(label) === want, routes(label));

const everyHit = ['electric fan', 'refrigerator', 'switch', 'washbasin', 'water tower', 'tractor', 'wardrobe', 'ashcan', 'broom', 'paintbrush']
  .map((l) => hitForLabel(l))
  .flatMap((h) => (h ? [h.category, h.problem].filter(Boolean) : ['<none>'])) as string[];
const unknownCodes = everyHit.filter((c) => !byCode(c));
check('every category and problem the map emits exists in the catalog', unknownCodes.length === 0, unknownCodes.join(', '));

const labels = ['background', 'washer, automatic washer', 'dishwasher', 'golden retriever', 'switch, electric switch'];
const folded = scoreCategories(labels, [0, 0.3, 0.25, 0.4, 0.05]);
check('related labels add up: washer 0.30 + dishwasher 0.25 = appliance 0.55', folded[0]?.category === 'appliance' && Math.abs(folded[0].confidence - 0.55) < 1e-6, JSON.stringify(folded[0]));
check('the dog is ignored even though it scored highest', !folded.some((f) => f.category === 'golden retriever'));

// ── quality gate ─────────────────────────────────────────────────────────────
const S = 224;
const make = (fn: (x: number, y: number) => number) => {
  const a = new Uint8Array(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) a.fill(fn(x, y), (y * S + x) * 3, (y * S + x) * 3 + 3);
  return a;
};
const checker = make((x, y) => ((x >> 3) + (y >> 3)) % 2 ? 220 : 40); // crisp edges
const flat = make(() => 128); // no edges at all = as blurred as it gets
const night = make((x, y) => ((x >> 3) + (y >> 3)) % 2 ? 20 : 5);
check('a crisp, bright picture passes', assessQuality(checker, S, S).verdict === 'ok');
check('a featureless picture is called blurry', assessQuality(flat, S, S).verdict === 'blurry');
check('a night picture is called dark (dark wins over blurry)', assessQuality(night, S, S).verdict === 'dark');

// ── diagnosis: honest about how sure it is ───────────────────────────────────
const fake = (probs: number[]): Classify => async () => ({ labels, probabilities: probs });
const run = async () => {
  const sure = await diagnose(checker, S, fake([0, 0.5, 0.2, 0.1, 0.05]));
  check('0.70 appliance -> sure', sure.kind === 'sure' && sure.best.category === 'appliance');
  const unsure = await diagnose(checker, S, fake([0, 0.2, 0.0, 0.3, 0.25]));
  check('0.25 electrical vs 0.20 appliance -> offers two guesses', unsure.kind === 'unsure' && unsure.guesses.length === 2 && unsure.guesses[0].category === 'electrical');
  const unknown = await diagnose(checker, S, fake([0, 0.02, 0.02, 0.9, 0.02]));
  check('a confident dog -> unknown, never a forced category', unknown.kind === 'unknown');
  const dogFirst = await diagnose(checker, S, fake([0, 0.3, 0.16, 0.5, 0]));
  check('appliance 0.46 but a dog at 0.50 -> not sure, only a guess', dogFirst.kind === 'unsure');
  const bad = await diagnose(night, S, fake([0, 1, 0, 0, 0]));
  check('a dark photo is stopped before the model runs', bad.kind === 'bad-photo');
  const forced = await diagnose(night, S, fake([0, 1, 0, 0, 0]), { skipQualityGate: true });
  check('the user can overrule the gate', forced.kind === 'sure');

  // ── safety table ───────────────────────────────────────────────────────────
  check('wiring gets the electrical safety card', safetyFor('wiring_fault') === 'safety_electrical');
  check('a fan gets no safety card', safetyFor('fan_dead') === null);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};
run();
