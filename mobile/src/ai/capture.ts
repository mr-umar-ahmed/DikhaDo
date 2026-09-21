import type { Image as NitroImage, RawPixelData } from 'react-native-nitro-image';
import type { CameraPhotoOutput } from 'react-native-vision-camera';

export type Shot = {
  /** file:// URI of an upright JPEG: shown in the sheet now, attached to the job later. */
  uri: string;
  /** size x size x 3 bytes, RGB, centre-cropped: what the model and the quality gate read. */
  rgb: Uint8Array;
};

/**
 * One still photo -> an upright JPEG on disk and a square RGB tensor in memory.
 * APIs verified against the installed vision-camera 5.2 / nitro-image 0.15 sources
 * (docs/research-phase3-apis.json). Bitmaps are native memory: every one is released, even on failure.
 */
export async function takeShot(output: CameraPhotoOutput, size: number): Promise<Shot> {
  const held: NitroImage[] = [];
  const hold = (img: NitroImage) => {
    // Android may hand back the same bitmap for a no-op crop or resize; never release one twice.
    if (!held.includes(img)) held.push(img);
    return img;
  };
  try {
    const photo = await output.capturePhoto({ flashMode: 'off', enableShutterSound: false }, {});
    let full: NitroImage;
    try {
      full = hold(await photo.toImageAsync()); // rotation and mirroring already applied to the pixels
    } finally {
      photo.dispose();
    }

    // Saved from the upright bitmap, so nothing downstream depends on EXIF handling.
    const path = await full.saveToTemporaryFileAsync('jpg', 85);

    // Centre-crop to a square first: resize stretches, it does not crop.
    const side = Math.min(full.width, full.height);
    const x0 = Math.floor((full.width - side) / 2);
    const y0 = Math.floor((full.height - side) / 2);
    const square = hold(await full.cropAsync(x0, y0, x0 + side, y0 + side));
    // A single bilinear step from ~768 px to 224 px aliases; halve first when far away.
    const mid = side > size * 3 ? hold(await square.resizeAsync(size * 2, size * 2)) : square;
    const small = hold(await mid.resizeAsync(size, size));

    const rgb = toRgb(await small.toRawPixelDataAsync(), size);
    return { uri: path.startsWith('file://') ? path : `file://${path}`, rgb };
  } finally {
    held.forEach((img) => {
      try {
        img.dispose();
      } catch {
        // already released
      }
    });
  }
}

/**
 * One training photo: upright, long side scaled to `maxSide`, written as a JPEG. Returns the temp path.
 * Training runs at 224 px, so 640 px keeps detail for augmentation while 1,500 photos stay near 100 MB.
 */
export async function takeTrainingPhoto(output: CameraPhotoOutput, maxSide = 640): Promise<string> {
  const held: NitroImage[] = [];
  try {
    const photo = await output.capturePhoto({ flashMode: 'off', enableShutterSound: false }, {});
    let full: NitroImage;
    try {
      full = await photo.toImageAsync();
      held.push(full);
    } finally {
      photo.dispose();
    }
    const scale = Math.min(1, maxSide / Math.max(full.width, full.height));
    const small = scale < 1 ? await full.resizeAsync(Math.round(full.width * scale), Math.round(full.height * scale)) : full;
    if (!held.includes(small)) held.push(small);
    return await small.saveToTemporaryFileAsync('jpg', 88);
  } finally {
    held.forEach((img) => {
      try {
        img.dispose();
      } catch {
        // already released
      }
    });
  }
}

/** Raw pixels arrive with 3 or 4 bytes per pixel in a platform-dependent channel order. Read the format; never assume it. */
function toRgb(raw: RawPixelData, size: number): Uint8Array {
  if (raw.width !== size || raw.height !== size) throw new Error(`expected ${size}x${size}, got ${raw.width}x${raw.height}`);
  const f = String(raw.pixelFormat);
  const bpp = f === 'RGB' || f === 'BGR' ? 3 : 4;
  let r: number, g: number, b: number;
  if (f === 'RGBA' || f === 'RGBX' || f === 'RGB') [r, g, b] = [0, 1, 2]; // Android ARGB_8888 reports RGBA
  else if (f === 'BGRA' || f === 'BGRX' || f === 'BGR') [r, g, b] = [2, 1, 0];
  else if (f === 'ARGB' || f === 'XRGB') [r, g, b] = [1, 2, 3];
  else if (f === 'ABGR' || f === 'XBGR') [r, g, b] = [3, 2, 1];
  else throw new Error(`unsupported pixel format ${f}`);

  const src = new Uint8Array(raw.buffer);
  const px = size * size;
  if (src.length < px * bpp) throw new Error('pixel buffer is smaller than the image');
  const out = new Uint8Array(px * 3);
  for (let i = 0, p = 0, o = 0; i < px; i++, p += bpp, o += 3) {
    out[o] = src[p + r];
    out[o + 1] = src[p + g];
    out[o + 2] = src[p + b];
  }
  return out;
}
