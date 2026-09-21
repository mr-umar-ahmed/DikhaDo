/**
 * A compact "what this scene looks like" fingerprint, made from the classifier's own output: the
 * strongest K label probabilities, as a sparse vector. No second model, no extra megabytes.
 * Two photos of the same place score high; a garbage heap and the swept ground that replaced it
 * still share their surroundings, while the garbage labels themselves fall away - which is exactly
 * what Proof of Fix needs to tell "fixed" from "different place" from "still there".
 */
export type Signature = { i: number[]; p: number[] };

const K = 40;

export function signatureOf(probabilities: ArrayLike<number>): Signature {
  const top: [number, number][] = [];
  for (let i = 0; i < probabilities.length; i++) {
    const p = probabilities[i];
    if (top.length < K) top.push([i, p]);
    else if (p > top[top.length - 1][1]) top[top.length - 1] = [i, p];
    else continue;
    top.sort((a, b) => b[1] - a[1]);
  }
  // Square-rooting flattens one dominant label so the scene's supporting labels still count.
  return { i: top.map(([i]) => i), p: top.map(([, p]) => Math.sqrt(p)) };
}

export function similarity(a: Signature, b: Signature): number {
  const bMap = new Map(b.i.map((idx, k) => [idx, b.p[k]]));
  let dot = 0, na = 0, nb = 0;
  a.i.forEach((idx, k) => {
    dot += a.p[k] * (bMap.get(idx) ?? 0);
    na += a.p[k] * a.p[k];
  });
  b.p.forEach((v) => (nb += v * v));
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export type FixVerdict = 'fixed' | 'still_broken' | 'unclear';

/**
 * Three honest states. `before` / `after` are how strongly the phone saw the problem (0-1) in each
 * photo; `same` is how alike the two scenes are. The citizen always has the last word: this is the
 * phone's opinion, shown with its reasons, never a silent decision.
 */
export function judgeFix(before: number, after: number, same: number): { verdict: FixVerdict; reason: 'gone' | 'still-there' | 'different-place' | 'never-seen' | 'not-sure' } {
  if (before < 0.12) return { verdict: 'unclear', reason: 'never-seen' }; // the phone never recognised the problem, so it cannot recognise its absence
  if (same < 0.2) return { verdict: 'unclear', reason: 'different-place' };
  if (after >= Math.max(0.25, before * 0.6)) return { verdict: 'still_broken', reason: 'still-there' };
  if (after <= Math.min(0.1, before * 0.25)) return { verdict: 'fixed', reason: 'gone' };
  return { verdict: 'unclear', reason: 'not-sure' };
}
