/**
 * «Без отличий» (#2312 п.1, приёмка этапа III Графита): every screen of e2e/screens.cjs as a picture, 3 widths × 2 themes,
 * compared with the base pictures. Run: `npm run check:visual` (from the repo root) after a web build (`npx expo export --platform web`).
 *
 * The base pictures are NOT in the repository (92 × 6 files would fatten its history): the base is the artifact of the last
 * green run on main (`visual-base`), CI puts it into e2e/visual/__base__ before the run; the run on main itself writes it
 * (`--update-snapshots`). Only the Linux of CI makes the base: fonts and anti-aliasing of another system differ.
 * A difference of colour is tuned by `threshold`, never by the share of pixels (the ratio stays 0).
 */
const { defineConfig } = require("@playwright/test");
const PORT = Number(process.env.VISUAL_PORT || 4173);
const WIDTHS = [390, 820, 1280];
const THEMES = ["dark", "light"];
module.exports = defineConfig({
  testDir: "e2e/visual",
  testMatch: "**/*.pw.cjs",
  snapshotPathTemplate: "{testDir}/__base__/{projectName}/{arg}{ext}",
  outputDir: "e2e/out/visual",
  timeout: 60_000,
  workers: process.env.VISUAL_WORKERS ? Number(process.env.VISUAL_WORKERS) : 3,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/out/visual-report" }]],
  // `--update-snapshots` writes; otherwise a missing base picture is a red test (nothing is written by a plain run)
  updateSnapshots: "none",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0, threshold: 0.2, animations: "disabled", caret: "hide" } },
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "en-US", reducedMotion: "reduce" },
  webServer: { command: "node e2e/visual/serve.cjs", url: `http://127.0.0.1:${PORT}`, reuseExistingServer: !process.env.CI },
  projects: THEMES.flatMap((theme) =>
    WIDTHS.map((width) => ({ name: `${width}-${theme}`, metadata: { theme }, use: { viewport: { width, height: width === 390 ? 844 : 900 } } })),
  ),
});
