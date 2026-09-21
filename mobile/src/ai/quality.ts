/**
 * Is this photo worth classifying? Computed from the same 224x224 RGB tensor the model will see,
 * so it costs a few milliseconds and no extra decode. A wrong answer from a dark or smeared photo
 * is worse than asking for another one - but the user can always overrule the gate.
 */
export type Quality = { luma: number; sharpness: number; verdict: 'ok' | 'dark' | 'blurry' };

// Deliberately conservative: only plainly unusable photos are stopped. Tuned on device; values are logged in dev builds.
export const DARK_BELOW = 32; // mean luma, 0-255
export const BLURRY_BELOW = 14; // variance of the Laplacian on luma

export function assessQuality(rgb: Uint8Array | Uint8ClampedArray, width: number, height: number): Quality {
  const n = width * height;
  const luma = new Float32Array(n);
  let sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const y = 0.299 * rgb[p] + 0.587 * rgb[p + 1] + 0.114 * rgb[p + 2];
    luma[i] = y;
    sum += y;
  }
  const mean = sum / n;

  // Variance of a 4-neighbour Laplacian: edges make it large, blur makes it small.
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = luma[i - 1] + luma[i + 1] + luma[i - width] + luma[i + width] - 4 * luma[i];
      lapSum += lap;
      lapSq += lap * lap;
      count++;
    }
  }
  const lapMean = lapSum / count;
  const sharpness = lapSq / count - lapMean * lapMean;

  const verdict = mean < DARK_BELOW ? 'dark' : sharpness < BLURRY_BELOW ? 'blurry' : 'ok';
  return { luma: mean, sharpness, verdict };
}
