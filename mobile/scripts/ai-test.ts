// Unit checks for the pure parts of the local AI layer. No phone, no model, no network.
//   cd mobile && npx tsx scripts/ai-test.ts
import { diagnose, type Classify } from '../src/ai/diagnose';
import { problemStrength } from '../src/ai/civic';
import { matchIntent } from '../src/ai/intent';
import { judgeFix, signatureOf, similarity } from '../src/ai/signature';
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

// ── speech intent: what people actually say, in the scripts recognisers actually return ──
for (const [said, want] of [
  ['fan kharab hai', 'fan_dead'], ['पंखा नहीं चल रहा है', 'fan_dead'], ['ఫ్యాన్ తిరగడం లేదు', 'fan_dead'],
  ['nal se pani tapak raha hai', 'tap_leak'], ['नल से पानी टपक रहा है', 'tap_leak'], ['కుళాయి లీక్ అవుతోంది', 'tap_leak'],
  ['motor start nahi ho rahi', 'pump_dead'], ['మోటార్ స్టార్ట్ కావడం లేదు', 'pump_dead'], ['बोरवेल की मोटर', 'borewell'],
  ['switch board se chingari aa rahi hai', 'wiring_fault'], ['స్విచ్ పనిచేయడం లేదు', 'switchboard'],
  ['water heater not working', 'geyser_install'], ['kachra uthana hai', 'bulk_waste'], ['చెత్త తీసుకెళ్లాలి', 'bulk_waste'],
  ['my laptop is slow', null], ['bike puncture ho gaya', 'mechanic'], ['दरवाज़ा टूट गया', 'carpentry'], ['', null],
] as const) {
  const got = matchIntent(said)?.code ?? null;
  check(`"${said}" -> ${want}`, got === want, String(got));
}
const intentCodes = ['fan_dead','cooler_fridge','geyser_install','wiring_fault','switchboard','inverter','tap_leak','tank_overflow','borewell','pump_dead','bulk_waste','mechanic','carpentry','mason','farm','cleaning','appliance','electrical','plumbing'];
check('every intent code exists in the catalog', intentCodes.every((c) => !!byCode(c)), intentCodes.filter((c) => !byCode(c)).join(','));

// ── scene signature + Proof of Fix ────────────────────────────────────────────
const vec = (pairs: [number, number][]) => { const v = new Float32Array(1001); pairs.forEach(([i, p]) => (v[i] = p)); return v; };
const street = vec([[10, 0.3], [11, 0.2], [12, 0.1]]);
const streetWithTrash = vec([[10, 0.2], [11, 0.15], [12, 0.05], [413, 0.5]]);
const kitchen = vec([[500, 0.4], [501, 0.3]]);
check('the same scene with and without the trash is still recognisably the same place', similarity(signatureOf(streetWithTrash), signatureOf(street)) > 0.5, similarity(signatureOf(streetWithTrash), signatureOf(street)).toFixed(2));
check('a different room is a different place', similarity(signatureOf(streetWithTrash), signatureOf(kitchen)) < 0.05);
check('identical photos score 1', Math.abs(similarity(signatureOf(street), signatureOf(street)) - 1) < 1e-6);
check('trash gone, same place -> fixed', judgeFix(0.5, 0.02, 0.7).verdict === 'fixed');
check('trash still there -> still broken', judgeFix(0.5, 0.45, 0.8).verdict === 'still_broken');
check('another street entirely -> unclear, never "fixed"', judgeFix(0.5, 0.0, 0.05).verdict === 'unclear');
check('the phone never saw the problem -> it cannot certify its absence', judgeFix(0.03, 0.0, 0.9).verdict === 'unclear');
check('half gone -> unclear, the citizen decides', judgeFix(0.5, 0.2, 0.7).verdict === 'unclear');
check('garbage strength reads the shipped labels', problemStrength('garbage', shipped as string[], vec([[(shipped as string[]).indexOf('ashcan'), 0.4], [(shipped as string[]).indexOf('plastic bag'), 0.2]])) > 0.59);
check('a pothole has no visual words: strength is 0, the citizen judges', problemStrength('pothole', shipped as string[], street) === 0);

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
