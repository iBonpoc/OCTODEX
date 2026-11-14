/**
 * #642 (Ф1 of #1083): every photo is made smaller in this one place before the app keeps it — before it is saved on the
 * phone, put in the offline queue and sent to the cloud. A full frame of a phone camera is 2–4 MB (30–50 MB on a 200 MP
 * camera); the long side at most PHOTO_LONG_SIDE px and JPEG at PHOTO_QUALITY make it ~250–500 KB — enough for an
 * estimate, a job, a receipt and a drawing. Same on iOS, Android and the web (expo-image-manipulator; on the web the
 * result is a `blob:` of this page, like the picker's own).
 * Pure part (`fitLongSide`): test/photoShrink.test.ts.
 */
import * as ImageManipulator from "expo-image-manipulator";

/** the long side of a kept photo, px (decision of the director 14.11, #642) */
export const PHOTO_LONG_SIDE = 2048;
/** JPEG quality of a kept photo, 0–1 */
export const PHOTO_QUALITY = 0.7;

/** the size to shrink to (aspect kept, whole pixels), or null: the photo already fits — it is never made larger */
export function fitLongSide(width: number, height: number, max = PHOTO_LONG_SIDE): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const long = Math.max(width, height);
  if (long <= max) return null;
  const k = max / long;
  return width >= height ? { width: max, height: Math.max(1, Math.round(height * k)) } : { width: Math.max(1, Math.round(width * k)), height: max };
}

/** what a picker gives: the address and, where it knows them, the pixel size */
export interface PickedImage {
  uri: string;
  width?: number;
  height?: number;
}

/**
 * The photo the app keeps: the long side ≤ PHOTO_LONG_SIDE, JPEG PHOTO_QUALITY. If the picture cannot be read here
 * (a format this browser does not decode), the original is kept: a big photo is better than a lost one.
 */
export async function shrinkPhoto(img: PickedImage): Promise<string> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(img.uri);
  try {
    let fit = img.width && img.height ? fitLongSide(img.width, img.height) : null;
    let ref = fit || (img.width && img.height) ? null : await ctx.renderAsync();
    if (ref) {
      // the picker did not say the size: read it from the picture itself
      fit = fitLongSide(ref.width, ref.height);
      if (fit) {
        ref.release();
        ref = null;
      }
    }
    if (fit) ctx.resize(fit);
    const out = ref ?? (await ctx.renderAsync());
    const saved = await out.saveAsync({ compress: PHOTO_QUALITY, format: ImageManipulator.SaveFormat.JPEG });
    out.release();
    return saved.uri;
  } catch (e) {
    // never lose the photo: the original is kept, and the log says why it is big
    console.warn("[photoShrink] the photo is kept as picked:", (e as Error)?.message ?? e);
    return img.uri;
  } finally {
    ctx.release();
  }
}

/** the first picked asset, made smaller (undefined: nothing picked) */
export async function shrinkPicked(res: { canceled: boolean; assets?: PickedImage[] | null } | null): Promise<string | undefined> {
  const a = res && !res.canceled ? res.assets?.[0] : undefined;
  return a?.uri ? shrinkPhoto(a) : undefined;
}
