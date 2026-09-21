import { scoreCategories, strongestNonJob, type CategoryScore } from './labelMap';
import { assessQuality, type Quality } from './quality';

/** Below this the phone does not claim to know; it offers its two best guesses instead. */
export const SURE_ABOVE = 0.45;
/** Below this a guess is not worth showing at all. */
export const GUESS_ABOVE = 0.08;

export type Diagnosis =
  | { kind: 'sure'; best: CategoryScore; others: CategoryScore[]; quality: Quality; ms: number }
  | { kind: 'unsure'; guesses: CategoryScore[]; quality: Quality; ms: number }
  | { kind: 'unknown'; quality: Quality; ms: number }
  | { kind: 'bad-photo'; quality: Quality };

/** Anything that turns a 224x224 RGB tensor into label probabilities. The TFLite model in the app; a fake in tests. */
export type Classify = (rgb: Uint8Array) => Promise<{ labels: readonly string[]; probabilities: ArrayLike<number> }>;

/**
 * The whole on-device judgement for one photo: quality gate, classification, folding labels into
 * catalog categories, and an honest statement of how sure the phone is. No network is involved.
 */
export async function diagnose(rgb: Uint8Array, size: number, classify: Classify, opts: { skipQualityGate?: boolean } = {}): Promise<Diagnosis> {
  const quality = assessQuality(rgb, size, size);
  if (!opts.skipQualityGate && quality.verdict !== 'ok') return { kind: 'bad-photo', quality };

  const started = Date.now();
  const { labels, probabilities } = await classify(rgb);
  const ms = Date.now() - started;

  const scores = scoreCategories(labels, probabilities).filter((s) => s.confidence >= GUESS_ABOVE);
  if (scores.length === 0) return { kind: 'unknown', quality, ms };
  // If the phone's single strongest answer was "not a job", it has no business being sure about a job.
  const doubted = strongestNonJob(labels, probabilities) > scores[0].confidence;
  if (scores[0].confidence >= SURE_ABOVE && !doubted) return { kind: 'sure', best: scores[0], others: scores.slice(1, 3), quality, ms };
  return { kind: 'unsure', guesses: scores.slice(0, 2), quality, ms };
}
