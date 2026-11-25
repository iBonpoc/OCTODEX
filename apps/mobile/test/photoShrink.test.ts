/** #642: a photo is kept with the long side ≤ 2048 px, JPEG 0.7; never made larger. #1558: a picture that cannot be made anew is never returned as picked (spec 46 §5.3а). */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Size = { width: number; height: number };
const log: { resized: Size[]; saved: { compress?: number; format?: string }[]; renders: number; released: number; refsReleased: number; failSave: boolean; fail: boolean; failRenders: number; src: Size } = {
  resized: [], saved: [], renders: 0, released: 0, refsReleased: 0, failSave: false, fail: false, failRenders: 0, src: { width: 0, height: 0 },
};
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
  ImageManipulator: {
    manipulate: () => {
      let cur = { ...log.src };
      return {
        resize(s: Size) {
          log.resized.push(s);
          cur = s;
          return this;
        },
        async renderAsync() {
          log.renders++;
          if (log.fail) throw new Error("cannot decode");
          if (log.failRenders > 0) {
            log.failRenders--;
            throw new Error("out of memory");
          }
          const size = { ...cur };
          return {
            ...size,
            async saveAsync(o: { compress?: number; format?: string }) {
              log.saved.push(o);
              if (log.failSave) throw new Error("disk full");
              return { uri: `file:///out-${size.width}x${size.height}.jpg`, ...size };
            },
            release() {
              log.refsReleased++;
            },
          };
        },
        release() {
          log.released++;
        },
      };
    },
  },
}));

const { fitLongSide, prepareForCloud, prepPicked, shrinkPicked, PHOTO_LONG_SIDE, PHOTO_QUALITY, PHOTO_SMALL_SIDE, PHOTO_SMALL_QUALITY } = await import("../src/data/photoShrink");
/** the file made, or the test fails (never the original) */
const shrinkPhoto = async (img: { uri: string; width?: number; height?: number }) => {
  const r = await prepareForCloud(img, false);
  return r.ok ? r.uri : `not made: ${r.why}`;
};

beforeEach(() => {
  Object.assign(log, { resized: [], saved: [], renders: 0, released: 0, refsReleased: 0, failSave: false, fail: false, failRenders: 0, src: { width: 0, height: 0 } });
  delete (globalThis as { __e2ePhotoDecodeFail?: boolean }).__e2ePhotoDecodeFail;
});

describe("fitLongSide", () => {
  it("the long side to 2048, the aspect kept, whole pixels", () => {
    expect(PHOTO_LONG_SIDE).toBe(2048);
    expect(fitLongSide(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(fitLongSide(3000, 4000)).toEqual({ width: 1536, height: 2048 });
    // a 200 MP frame
    expect(fitLongSide(16320, 12240)).toEqual({ width: 2048, height: 1536 });
    expect(fitLongSide(5000, 5000)).toEqual({ width: 2048, height: 2048 });
    // a panorama: the short side never 0
    expect(fitLongSide(100000, 10)).toEqual({ width: 2048, height: 1 });
  });
  it("a photo that fits is never made larger", () => {
    expect(fitLongSide(2048, 1000)).toBeNull();
    expect(fitLongSide(640, 480)).toBeNull();
  });
  it("no size known: nothing to compute", () => {
    expect(fitLongSide(0, 0)).toBeNull();
    expect(fitLongSide(NaN, 100)).toBeNull();
  });
  it("every result has the long side ≤ 2048", () => {
    for (let w = 1; w < 20000; w += 997) for (let h = 1; h < 20000; h += 1301) {
      const f = fitLongSide(w, h) ?? { width: w, height: h };
      expect(Math.max(f.width, f.height)).toBeLessThanOrEqual(2048);
    }
  });
});

describe("shrinkPhoto", () => {
  it("a big photo with a known size: one resize to ≤ 2048, saved as JPEG 0.7", async () => {
    log.src = { width: 4032, height: 3024 };
    const uri = await shrinkPhoto({ uri: "file:///big.jpg", width: 4032, height: 3024 });
    expect(log.resized).toEqual([{ width: 2048, height: 1536 }]);
    expect(log.saved).toEqual([{ compress: PHOTO_QUALITY, format: "jpeg" }]);
    expect(PHOTO_QUALITY).toBe(0.7);
    expect(uri).toBe("file:///out-2048x1536.jpg");
    expect(log.renders).toBe(1);
    expect(log.released).toBe(1);
    expect(log.refsReleased).toBe(1);
  });
  it("the picker did not say the size: it is read from the picture, then made smaller", async () => {
    log.src = { width: 3000, height: 6000 };
    const uri = await shrinkPhoto({ uri: "blob:http://x/1" });
    expect(log.resized).toEqual([{ width: 1024, height: 2048 }]);
    expect(uri).toBe("file:///out-1024x2048.jpg");
    // the picture read for its size and the smaller one: both let go
    expect(log.refsReleased).toBe(2);
  });
  it("saving fails every time: no file, the original is never returned, every picture is let go (#1558)", async () => {
    log.src = { width: 4000, height: 3000 };
    log.failSave = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await prepareForCloud({ uri: "file:///big.jpg", width: 4000, height: 3000 }, false);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("file:///big.jpg");
    // c1 twice, c2 once — each let go
    expect(log.refsReleased).toBe(3);
    expect(log.released).toBe(3);
    // the reason of every way in the log
    expect(warn).toHaveBeenCalledTimes(3);
    expect(String(warn.mock.calls[0]?.[0])).toContain("photoPrep");
    warn.mockRestore();
  });
  it("a small photo: not made larger, only saved as JPEG 0.7", async () => {
    log.src = { width: 800, height: 600 };
    expect(await shrinkPhoto({ uri: "file:///s.png", width: 800, height: 600 })).toBe("file:///out-800x600.jpg");
    expect(log.resized).toEqual([]);
    expect(log.saved).toHaveLength(1);
    log.saved = [];
    expect(await shrinkPhoto({ uri: "file:///s.png" })).toBe("file:///out-800x600.jpg");
    expect(log.resized).toEqual([]);
    expect(log.saved).toHaveLength(1);
  });
  it("c1 fails once: the second c1 (a new context) gives the file", async () => {
    log.src = { width: 4000, height: 3000 };
    log.failRenders = 1;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await prepareForCloud({ uri: "file:///a.jpg", width: 4000, height: 3000 }, false)).toEqual({ ok: true, uri: "file:///out-2048x1536.jpg", way: "c1" });
    // two contexts, both let go
    expect(log.released).toBe(2);
    warn.mockRestore();
  });
  it("c1 fails twice: c2 — the long side 1024, JPEG 0.6, marked small", async () => {
    log.src = { width: 4000, height: 3000 };
    log.failRenders = 2;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(PHOTO_SMALL_SIDE).toBe(1024);
    expect(PHOTO_SMALL_QUALITY).toBe(0.6);
    expect(await prepareForCloud({ uri: "file:///a.jpg", width: 4000, height: 3000 }, false)).toEqual({ ok: true, uri: "file:///out-1024x768.jpg", way: "c2", small: true });
    expect(log.saved.at(-1)).toEqual({ compress: 0.6, format: "jpeg" });
    warn.mockRestore();
  });
  it("nothing reads it (not the web): not made, the reason and the last way told — the original is never returned", async () => {
    log.fail = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await prepareForCloud({ uri: "file:///x.heic", width: 4000, height: 3000 }, false);
    expect(r).toEqual({ ok: false, way: "c2", why: "cannot decode" });
    expect(log.released).toBe(3);
    // a web address too: never given back
    const d = await prepareForCloud({ uri: "data:image/heic;base64,AAAA" }, false);
    expect(d.ok).toBe(false);
    expect(await shrinkPicked({ canceled: false, assets: [{ uri: "blob:http://x/heic" }] }, false)).toBeUndefined();
    // what was picked: kept on this phone only, as «preparing»
    expect(await prepPicked({ canceled: false, assets: [{ uri: "blob:http://x/heic" }] }, false)).toEqual({ preparing: { uri: "blob:http://x/heic", way: "c2", why: "cannot decode" } });
    warn.mockRestore();
  });
  it("the web: c1 and c2 fail — c3 (the browser's canvas) gives a JPEG; it fails too — not made", async () => {
    log.fail = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const g = globalThis as Record<string, unknown>;
    const saved = { fetch: g.fetch, createImageBitmap: g.createImageBitmap, document: g.document, URL: g.URL };
    const drawn: number[][] = [];
    const types: unknown[] = [];
    let bitmapFails = false;
    g.fetch = async () => ({ blob: async () => ({ size: 10 }) });
    g.createImageBitmap = async () => {
      if (bitmapFails) throw new Error("bitmap: unsupported");
      return { width: 4000, height: 3000, close() {} };
    };
    g.document = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: (_b: unknown, x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h]) }),
        toBlob: (cb: (b: unknown) => void, type: string, q: number) => {
          types.push([type, q]);
          cb({ size: 5 });
        },
      }),
    };
    g.URL = Object.assign(Object.create(saved.URL as object), { createObjectURL: () => "blob:http://x/c3" });
    try {
      expect(await prepareForCloud({ uri: "blob:http://x/heic" }, true)).toEqual({ ok: true, uri: "blob:http://x/c3", way: "c3" });
      expect(drawn).toEqual([[0, 0, 2048, 1536]]);
      expect(types).toEqual([["image/jpeg", 0.7]]);
      bitmapFails = true;
      expect(await prepareForCloud({ uri: "blob:http://x/heic" }, true)).toEqual({ ok: false, way: "c3", why: "bitmap: unsupported" });
    } finally {
      Object.assign(g, saved);
      warn.mockRestore();
    }
  });
  it("the e2e switch makes every way fail (spec 46 §5.3а, e2e 399)", async () => {
    log.src = { width: 800, height: 600 };
    (globalThis as { __e2ePhotoDecodeFail?: boolean }).__e2ePhotoDecodeFail = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await prepareForCloud({ uri: "file:///s.jpg", width: 800, height: 600 }, true)).ok).toBe(false);
    expect(log.renders).toBe(0);
    warn.mockRestore();
  });
});

describe("shrinkPicked", () => {
  it("the first asset made smaller; cancelled or empty — nothing", async () => {
    log.src = { width: 4000, height: 3000 };
    expect(await shrinkPicked({ canceled: false, assets: [{ uri: "file:///a.jpg", width: 4000, height: 3000 }] })).toBe("file:///out-2048x1536.jpg");
    expect(await shrinkPicked({ canceled: true, assets: null })).toBeUndefined();
    expect(await shrinkPicked({ canceled: false, assets: [] })).toBeUndefined();
    expect(await shrinkPicked(null)).toBeUndefined();
  });
});
