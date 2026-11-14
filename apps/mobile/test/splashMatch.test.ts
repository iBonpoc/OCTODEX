import fs from "fs";
import path from "path";
import zlib from "zlib";
import { describe, expect, it } from "vitest";
import { component, motion } from "@octo/design-tokens";
import { GR_VIEW } from "../src/ui/brandRules";

/**
 * The launch without a jump (DS §18.2 «Запуск» v4.3, #1394): the native splash's mark is the boot layer's first frame —
 * the same size, in the same place — and both are what index.html draws on the web before the JS. A new splash image,
 * a new `imageWidth` or a new `brand.wait` that breaks this fails here, not on the founder's phone.
 */
const ROOT = path.join(__dirname, "..");
const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8")).expo;
const plug = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen")?.[1];

/** an 8-bit RGBA png, non-interlaced (what the splash images are) — read with node's zlib, no new dependency (rule 17) */
function readPng(buf: Buffer): { width: number; height: number; alpha: (x: number, y: number) => number } {
  let pos = 8;
  const idat: Buffer[] = [];
  let width = 0, height = 0, depth = 0, type = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") [width, height, depth, type] = [body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9]];
    if (kind === "IDAT") idat.push(body);
    pos += 12 + len;
  }
  if (depth !== 8 || type !== 6) throw new Error(`the splash must be 8-bit RGBA (depth ${depth}, type ${type})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const r = raw[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? px[(y - 1) * stride + i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][f];
      px[y * stride + i] = (r + pred) & 0xff;
    }
  }
  return { width, height, alpha: (x, y) => px[y * stride + x * bpp + 3] };
}

/** the box of the opaque pixels of a png */
function inkBox(file: string) {
  const png = readPng(fs.readFileSync(path.join(ROOT, file)));
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      if (png.alpha(x, y) < 128) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  return { side: png.width, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const markH = component.brand.wait;
const markW = (markH * GR_VIEW.w) / GR_VIEW.h;

describe("unit:splashMatch — the splash is the launch layer's first frame (#1394)", () => {
  it("imageWidth is the token; the image is square (iOS draws it imageWidth × imageWidth, Android in a 288 dp canvas)", () => {
    expect(plug.imageWidth).toBe(component.brand.splash);
    expect(plug.resizeMode).toBe("contain");
  });

  for (const img of [plug?.image, plug?.dark?.image]) {
    it(`${img}: the mark in it is the layer's mark — the same size (±1 pt), in the centre, inside Android's circle`, () => {
      const b = inkBox(img);
      expect(b.w).toBeGreaterThan(0);
      const pt = component.brand.splash / b.side; // one png pixel, in pt / dp
      // the layer draws the mark's box markW × markH; its ink is the glyphs inside that box (GR_VIEW has a small margin)
      const inkW = b.w * pt, inkH = b.h * pt;
      expect(inkW).toBeLessThanOrEqual(markW + 1);
      expect(inkH).toBeLessThanOrEqual(markH + 1);
      expect(inkW).toBeGreaterThan(markW * 0.9);
      expect(inkH).toBeGreaterThan(markH * 0.9);
      // in the centre: the splash centres the image, the layer centres the mark — the same middle (±1 pt)
      expect(Math.abs((b.x0 + b.w / 2 - b.side / 2) * pt)).toBeLessThanOrEqual(1);
      expect(Math.abs((b.y0 + b.h / 2 - b.side / 2) * pt)).toBeLessThanOrEqual(1);
      // Android 12+ shows the icon in a circle of 192 dp: the mark's corners must not be cut
      expect(Math.hypot(inkW, inkH)).toBeLessThan(192);
    });
  }

  it("the web draws the same mark before the JS: index.html's svg is brand.wait high", () => {
    const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
    const svg = /<div id="gx-boot"[\s\S]*?<svg ([^>]*)>/.exec(html)?.[1] ?? "";
    expect(svg).toContain(`viewBox="${GR_VIEW.x} ${GR_VIEW.y} ${GR_VIEW.w} ${GR_VIEW.h}"`);
    expect(svg).toContain(`height="${markH}"`);
    expect(svg).toContain(`width="${Math.round(markW)}"`);
    // the body has no browser margin (8 px): the mark before the JS is in the very middle, as the layer (#1394)
    expect(html).toMatch(/body \{\s*(\/\*[^*]*\*\/\s*)?margin: 0;/);
  });

  it("the layer: the mark brand.wait in the middle; the splash goes with a fade of durBase; the exit grows and fades", () => {
    const boot = fs.readFileSync(path.join(ROOT, "src", "features", "boot.tsx"), "utf8");
    expect(boot).toMatch(/const size = component\.brand\.wait;/);
    expect(boot).toMatch(/setOptions\?\.\(\{ fade: true, duration: motion\.durBase \}\)/);
    expect(boot).toMatch(/motion\.brandExitScale/);
    // the layer comes over the shell before its first paint, not after it (a frame of the shell without the layer)
    expect(boot).toMatch(/useLayoutEffect\(\(\) => done\(\), \[done\]\)/);
    // no intro, no short entry at the launch any more (founder 14.11: «скачок»)
    // the mark is never swapped for the logo at the launch (a change of form is a jump)
    expect(boot).not.toMatch(/BrandIntro|BrandLogo|BrandQuick/);
    // the exit without a blink (v4.4): the growth on easeOut, the fade after its delay on easeIn
    expect(boot).toMatch(/withDelay\(motion\.brandExitFadeDelay, withTiming\(0, \{ duration: motion\.durFast, easing: Easing\.bezier\(\.\.\.motion\.easeIn\) \}\)\)/);
    expect(motion.brandExitScale).toBeGreaterThan(1);
    expect(motion.brandExitScale).toBeLessThan(1.1);
  });
});
