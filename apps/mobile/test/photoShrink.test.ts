/** #642: a photo is kept with the long side ≤ 2048 px, JPEG 0.7; never made larger; a picture that cannot be read is kept as is. */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Size = { width: number; height: number };
const log: { resized: Size[]; saved: { compress?: number; format?: string }[]; renders: number; released: number; refsReleased: number; failSave: boolean; fail: boolean; src: Size } = {
  resized: [], saved: [], renders: 0, released: 0, refsReleased: 0, failSave: false, fail: false, src: { width: 0, height: 0 },
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

const { fitLongSide, shrinkPhoto, shrinkPicked, PHOTO_LONG_SIDE, PHOTO_QUALITY } = await import("../src/data/photoShrink");

beforeEach(() => {
  Object.assign(log, { resized: [], saved: [], renders: 0, released: 0, refsReleased: 0, failSave: false, fail: false, src: { width: 0, height: 0 } });
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
  it("saving fails: the original is kept and every picture is let go", async () => {
    log.src = { width: 4000, height: 3000 };
    log.failSave = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await shrinkPhoto({ uri: "file:///big.jpg", width: 4000, height: 3000 })).toBe("file:///big.jpg");
    expect(log.refsReleased).toBe(1);
    expect(log.released).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
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
  it("a picture this device cannot read: the original is kept, not lost", async () => {
    log.fail = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await shrinkPhoto({ uri: "file:///x.heic", width: 4000, height: 3000 })).toBe("file:///x.heic");
    expect(log.released).toBe(1);
    // a warning in the log, not a silent big photo
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("photoShrink");
    // a web address (blob: or data:) is kept too
    expect(await shrinkPhoto({ uri: "data:image/heic;base64,AAAA" })).toBe("data:image/heic;base64,AAAA");
    expect(await shrinkPicked({ canceled: false, assets: [{ uri: "blob:http://x/heic" }] })).toBe("blob:http://x/heic");
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
