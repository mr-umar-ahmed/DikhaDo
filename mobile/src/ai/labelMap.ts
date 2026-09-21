/**
 * Day-one bridge from a stock ImageNet classifier to DikhaDo's catalog. The model knows a thousand
 * everyday objects; this table says which of them mean "someone needs a worker", and which one.
 *
 * Matching is by keyword against the label text, so it survives the small differences between
 * ImageNet label files ("ashcan, trash can, garbage can" vs "ashcan"). When the fine-tuned model
 * lands (ml/train.py) its labels ARE catalog codes and this file is bypassed - same interface.
 *
 * Civic classes (street sign, manhole cover, ...) are added with the panchayat rail in Phase 7;
 * until that rail exists they fall through to "could not tell", which leads to the picture grid.
 */
export type Hit = { category: string; problem?: string };

const rules: [keywords: string[], hit: Hit][] = [
  // Fan and appliances
  [['electric fan'], { category: 'appliance', problem: 'fan_dead' }],
  [['refrigerator', 'icebox'], { category: 'appliance', problem: 'cooler_fridge' }],
  [['washer', 'washing machine', 'microwave', 'toaster', 'waffle iron', 'vacuum', 'space heater', 'television', 'monitor', 'hand blower', 'hair dryer', 'rotisserie', 'crock pot', 'espresso maker', 'coffeepot', 'stove', 'dishwasher', 'loudspeaker', 'radio', 'cassette player', 'sewing machine', 'iron'],
    { category: 'appliance' }],

  // Electrical
  [['switch'], { category: 'electrical', problem: 'switchboard' }],
  [['table lamp', 'lampshade', 'spotlight', 'electric guitar amplifier', 'power drill'], { category: 'electrical' }],

  // Plumbing
  [['washbasin', 'handbasin', 'sink', 'bathtub', 'tub', 'bucket', 'toilet seat', 'plunger', 'shower curtain', 'soap dispenser'], { category: 'plumbing', problem: 'tap_leak' }],
  [['water tower', 'barrel'], { category: 'plumbing', problem: 'tank_overflow' }],

  // Bike and tractor repair
  [['motor scooter', 'moped', 'mountain bike', 'bicycle', 'tricycle', 'tractor', 'car wheel', 'disk brake', 'disc brake', 'jeep', 'minivan', 'pickup', 'harvester', 'thresher', 'plow', 'go-kart', 'tow truck', 'minibus', 'cab'],
    { category: 'mechanic' }],

  // Carpentry
  [['folding chair', 'rocking chair', 'dining table', 'desk', 'wardrobe', 'chiffonier', 'bookcase', 'china cabinet', 'sliding door', 'chest', 'cradle', 'crib', 'four-poster', 'studio couch', 'park bench', 'window shade', 'window screen', 'file', 'medicine chest', 'throne', 'barber chair'],
    { category: 'carpentry' }],

  // Garbage pickup
  [['ashcan', 'trash can', 'garbage', 'dustbin', 'plastic bag'], { category: 'waste', problem: 'bulk_waste' }],

  // Cleaning
  [['broom', 'swab', 'mop'], { category: 'cleaning' }],

  // Mason and painting
  [['paintbrush', 'stone wall', 'tile roof', 'brick'], { category: 'mason' }],
];

// "iron" must not match "waffle iron" twice or "environment": keywords match on word boundaries.
const matchers = rules.map(([keywords, hit]) => ({
  hit,
  tests: keywords.map((k) => new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`)),
}));

/** Labels from the fine-tuned model (ml/train.py) carry their own routing: "dikhado:electrical/switchboard". */
const OWN = 'dikhado:';

export function hitForLabel(label: string): Hit | null {
  if (label.startsWith(OWN)) {
    const [category, problem] = label.slice(OWN.length).split('/');
    // "other" is the class that lets the phone say it cannot tell.
    return !category || category === 'other' ? null : { category, problem };
  }
  const text = label.toLowerCase();
  for (const m of matchers) if (m.tests.some((t) => t.test(text))) return m.hit;
  return null;
}

/** The strongest single label that is NOT a job (a dog, a face, the fine-tuned "other"). */
export function strongestNonJob(labels: readonly string[], probabilities: ArrayLike<number>): number {
  let best = 0;
  for (let i = 0; i < probabilities.length; i++) {
    if (probabilities[i] > best && !hitForLabel(labels[i] ?? '')) best = probabilities[i];
  }
  return best;
}

export type CategoryScore = { category: string; problem?: string; confidence: number };

/**
 * Fold a thousand label probabilities into catalog categories. Several labels can point at the
 * same category ("washer" + "dishwasher"), so their probabilities add: the phone is sure it is an
 * appliance even when it is unsure which.
 */
export function scoreCategories(labels: readonly string[], probabilities: ArrayLike<number>): CategoryScore[] {
  const byCategory = new Map<string, { confidence: number; best: number; problem?: string }>();
  for (let i = 0; i < probabilities.length; i++) {
    const p = probabilities[i];
    if (p < 0.01) continue;
    const hit = hitForLabel(labels[i] ?? '');
    if (!hit) continue;
    const entry = byCategory.get(hit.category) ?? { confidence: 0, best: 0 };
    entry.confidence += p;
    // The sub-problem comes from the single strongest label, not from the sum.
    if (p > entry.best) {
      entry.best = p;
      entry.problem = hit.problem;
    }
    byCategory.set(hit.category, entry);
  }
  return [...byCategory.entries()]
    .map(([category, e]) => ({ category, problem: e.problem, confidence: Math.min(1, e.confidence) }))
    .sort((a, b) => b.confidence - a.confidence);
}
