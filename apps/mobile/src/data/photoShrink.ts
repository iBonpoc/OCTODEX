/**
 * #1558: nothing here ever returns the original — a photo that cannot be made anew is not sent (spec 46 §5.3а).
 * #642 (Ф1 of #1083): every photo is made smaller in this one place before the app keeps it — before it is saved on the
 * phone, put in the offline queue and sent to the cloud. A full frame of a phone camera is 2–4 MB (30–50 MB on a 200 MP
 * camera); the long side at most PHOTO_LONG_SIDE px and JPEG at PHOTO_QUALITY make it ~250–500 KB — enough for an
 * estimate, a job, a receipt and a drawing. Same on iOS, Android and the web (expo-image-manipulator; on the web the
 * result is a `blob:` of this page, like the picker's own).
 * Pure part (`fitLongSide`): test/photoShrink.test.ts.
 */
import * as ImageManipulator from "expo-image-manipulator";
import { dropPickedCopy, keptHere } from "./localFiles";
import type { PrepWay } from "./types";

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

/** #1558 (spec 46 §5.3а): the second way — half the long side, for a phone short of memory */
export const PHOTO_SMALL_SIDE = 1024;
export const PHOTO_SMALL_QUALITY = 0.6;

/** a way of making the file anew: c1 — 2048/0.7 (twice), c2 — 1024/0.6, c3 — the browser's own canvas (web only) */
export type { PrepWay };

/** the file the cloud may take (made anew here — no metadata of the original), or why none could be made */
export type Prepared = { ok: true; uri: string; way: PrepWay; small?: true } | { ok: false; way: PrepWay; why: string };

/** e2e only (spec 46 §5.3а): the web build's test makes every way fail, to see «Готовится» without a broken picture */
const forcedFail = () => !!(globalThis as { __e2ePhotoDecodeFail?: boolean }).__e2ePhotoDecodeFail;

/** one way of expo-image-manipulator: long side ≤ max, JPEG q; throws when the picture cannot be read or saved */
async function viaManipulator(img: PickedImage, max: number, q: number): Promise<string> {
  if (forcedFail()) throw new Error("e2e: decode off");
  const ctx = ImageManipulator.ImageManipulator.manipulate(img.uri);
  // every picture made here is let go, also when a step fails (a native image otherwise stays in memory)
  const refs: { release(): void }[] = [];
  try {
    const sizeKnown = !!(img.width && img.height);
    let fit = sizeKnown ? fitLongSide(img.width!, img.height!, max) : null;
    let out = null as Awaited<ReturnType<typeof ctx.renderAsync>> | null;
    if (!sizeKnown) {
      // the picker did not say the size: read it from the picture itself
      out = await ctx.renderAsync();
      refs.push(out);
      fit = fitLongSide(out.width, out.height, max);
      if (fit) out = null;
    }
    if (fit) ctx.resize(fit);
    if (!out) {
      out = await ctx.renderAsync();
      refs.push(out);
    }
    const saved = await out.saveAsync({ compress: q, format: ImageManipulator.SaveFormat.JPEG });
    return saved.uri;
  } finally {
    for (const r of refs) r.release();
    ctx.release();
  }
}

/** the web's other decoder: the picture drawn on a canvas and saved as JPEG (a canvas carries no metadata) */
async function viaCanvas(img: PickedImage, max: number, q: number): Promise<string> {
  if (forcedFail()) throw new Error("e2e: decode off");
  const blob = await (await fetch(img.uri)).blob();
  const bmp = await createImageBitmap(blob);
  try {
    const size = fitLongSide(bmp.width, bmp.height, max) ?? { width: bmp.width, height: bmp.height };
    const cv = document.createElement("canvas");
    cv.width = size.width;
    cv.height = size.height;
    const g = cv.getContext("2d");
    if (!g) throw new Error("no 2d canvas");
    g.drawImage(bmp, 0, 0, size.width, size.height);
    const out = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", q));
    if (!out) throw new Error("canvas gave no JPEG");
    return URL.createObjectURL(out);
  } finally {
    bmp.close?.();
  }
}

const isWeb = () => typeof document !== "undefined" && typeof createImageBitmap === "function";

/**
 * #1558 (spec 46 §5.3а): the only file a photo or a receipt sends to the cloud. The ways in order — c1 twice (the
 * second with a new context: a phone short of memory often manages a moment later), c2 (1024/0.6, marked small), c3
 * on the web; the first that works gives the file. None works — no file: the original (with its EXIF and GPS) is never
 * returned, the caller keeps it on this phone as «preparing» and tries again later.
 */
export async function prepareForCloud(img: PickedImage, web = isWeb()): Promise<Prepared> {
  let last: { way: PrepWay; why: string } = { way: "c1", why: "" };
  const tryWay = async (way: PrepWay, make: () => Promise<string>): Promise<string | null> => {
    try {
      return await make();
    } catch (e) {
      last = { way, why: String((e as Error)?.message ?? e).slice(0, 200) };
      // the reason of every failed way in the log (never the photo itself) — #1555 collects it
      console.warn("[photoPrep]", way, last.why);
      return null;
    }
  };
  let uri = await tryWay("c1", () => viaManipulator(img, PHOTO_LONG_SIDE, PHOTO_QUALITY));
  if (uri) return { ok: true, uri, way: "c1" };
  uri = await tryWay("c1", () => viaManipulator(img, PHOTO_LONG_SIDE, PHOTO_QUALITY));
  if (uri) return { ok: true, uri, way: "c1" };
  uri = await tryWay("c2", () => viaManipulator(img, PHOTO_SMALL_SIDE, PHOTO_SMALL_QUALITY));
  if (uri) return { ok: true, uri, way: "c2", small: true };
  if (web) {
    uri = await tryWay("c3", () => viaCanvas(img, PHOTO_LONG_SIDE, PHOTO_QUALITY));
    if (uri) return { ok: true, uri, way: "c3" };
  }
  return { ok: false, ...last };
}

/** what was picked: the file for the cloud, or the original kept only on this phone while it is being prepared */
export type PickedPhoto = { uri: string; small?: true } | { preparing: { uri: string; way: PrepWay; why: string } };

/** the first picked asset, prepared (undefined: nothing picked) */
export async function prepPicked(res: { canceled: boolean; assets?: PickedImage[] | null } | null, web?: boolean): Promise<PickedPhoto | undefined> {
  const a = res && !res.canceled ? res.assets?.[0] : undefined;
  if (!a?.uri) return undefined;
  const r = await prepareForCloud(a, web);
  // #1659: the picker's full-size copy goes only once a new file is made (never the person's library); a «preparing»
  // original stays — its record names it and «Подготовить снова» needs it. A later round (store) drops nothing: the sweep does
  if (r.ok) dropPickedCopy(a.uri, r.uri);
  keptHere(r.ok ? r.uri : a.uri);
  return r.ok ? (r.small ? { uri: r.uri, small: true } : { uri: r.uri }) : { preparing: { uri: a.uri, way: r.way, why: r.why } };
}

/** the first picked asset as a file for the cloud only (undefined: nothing picked, or it could not be prepared) */
export async function shrinkPicked(res: { canceled: boolean; assets?: PickedImage[] | null } | null, web?: boolean): Promise<string | undefined> {
  const p = await prepPicked(res, web);
  return p && "uri" in p ? p.uri : undefined;
}
