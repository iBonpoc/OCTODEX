/**
 * e2e 519 — old links go to their target before any screen shows (#2273; found by #2271). Every view.
 * - the canvas link «Смета из замера» (/module/gutters/draw?m=…&estimate=1): the review opens and asks, the canvas never mounted;
 *   a measurement the phone does not have: the review says «not found», the canvas never mounted;
 * - /leads?tab=invoices → «Счета», /inbox?tab=estimates → «Сметы» in one hop: the leads board never mounted.
 * An init script records every testID that ever appears in the page and every URL the app goes to, so a screen that shows for one
 * frame and replaces itself is caught. Finds things by testID; waits on what it checks.
 */
const { skipLength, savedOnce } = require("../gutters.cjs");

const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const path = () => new URL(p.url()).pathname;
  await p.addInitScript(() => {
    const w = window;
    w.__seen = new Set();
    w.__nav = [];
    const note = () => w.__nav.push(location.pathname + location.search);
    for (const k of ["pushState", "replaceState"]) {
      const f = history[k].bind(history);
      history[k] = (...a) => { const r = f(...a); note(); return r; };
    }
    const scan = (n) => {
      if (n.nodeType !== 1) return;
      const id = n.getAttribute("data-testid");
      if (id) w.__seen.add(id);
      for (const c of n.querySelectorAll("[data-testid]")) w.__seen.add(c.getAttribute("data-testid"));
    };
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) scan(n); }).observe(document, { childList: true, subtree: true });
  });
  const seen = () => p.evaluate(() => [...window.__seen]);
  const navs = () => p.evaluate(() => window.__nav.slice());

  // a lead's measurement with one run (as e2e 473)
  await h.go("/today");
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, DB_KEY, { timeout: 8000 });
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-measure").getByRole("button").click();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  await p.mouse.move(b.x + b.width * 0.25, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.25 + (0.45 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  await savedOnce(p);
  await p.waitForFunction(() => !!new URL(location.href).searchParams.get("m"), null, { timeout: 8000 });
  const mid = new URL(p.url()).searchParams.get("m");

  // the old canvas link with estimate=1: the review asks; no frame of the canvas
  await h.go(`/module/gutters/draw?m=${encodeURIComponent(mid)}&estimate=1`);
  await tid("view-estimate-ask").waitFor({ timeout: 8000 });
  h.expect(path() === "/module/gutters/view" && new URL(p.url()).searchParams.get("m") === mid, `the review of that measurement (${p.url()})`);
  const drawn = (await seen()).filter((id) => id.startsWith("draw-"));
  h.expect(drawn.length === 0, `the canvas never mounted (${drawn.slice(0, 5).join(", ")})`);
  await h.shot("canvas-link");

  // a measurement this phone does not have: the review says so; still no canvas
  await h.go("/module/gutters/draw?m=00000000-0000-4000-8000-000000000516&estimate=1");
  await tid("view-not-found").waitFor({ timeout: 8000 });
  const drawn2 = (await seen()).filter((id) => id.startsWith("draw-"));
  h.expect(drawn2.length === 0, `no canvas for a missing measurement (${drawn2.slice(0, 5).join(", ")})`);

  // /leads?tab=invoices → «Счета»: the leads board never mounted
  const board = (ids) => ids.filter((id) => id === "leads-screen");
  await h.go("/leads?tab=invoices");
  await p.waitForURL((u) => u.pathname === "/invoice", { timeout: 8000 });
  h.expect(board(await seen()).length === 0, `no frame of the leads board on /leads?tab=invoices (${board(await seen()).slice(0, 3).join(", ")})`);

  // /inbox?tab=estimates → «Сметы» in one hop, never through /leads
  await h.go("/inbox?tab=estimates");
  await p.waitForURL((u) => u.pathname === "/estimates", { timeout: 8000 });
  const hops = await navs();
  h.expect(!hops.some((u) => u.startsWith("/leads")), `one hop, not through /leads (${hops.join(" → ")})`);
  h.expect(board(await seen()).length === 0, "no frame of the leads board on /inbox?tab=estimates");
};
