/**
 * e2e 515 — «Замер» с карточки клиента знает цель в момент нажатия (#2271, основатель 20.11: «вначале открывается одно окно,
 * и потом резко открывается второе»; spec 33 П24 А3). Every view.
 * - one address → the measurement of that address at once: the start screen is never in the way (no frame of it, not in the
 *   history) and «назад» comes back to the client;
 * - several → a sheet of the addresses on the card, a row → that address's measurement, «назад» → the client;
 * - none → a line «add an address» under the button, the screen stays.
 * Every URL the app goes through is recorded (pushState / replaceState / popstate), so a start screen that shows for one frame
 * and replaces itself is caught. Finds things by testID; waits on what it checks.
 */
const { sheetGone } = require("../sheet.cjs");

const DB_KEY = "octo.db.v5";
const START = "/module/gutters/start";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const path = () => new URL(p.url()).pathname;
  const qp = (k) => new URL(p.url()).searchParams.get(k);
  // every address the app goes to, from the first frame of each page
  await p.addInitScript(() => {
    const w = window;
    w.__nav = [];
    const note = () => w.__nav.push(location.pathname + location.search);
    for (const k of ["pushState", "replaceState"]) {
      const f = history[k].bind(history);
      history[k] = (...a) => { const r = f(...a); note(); return r; };
    }
    addEventListener("popstate", note);
  });
  const navs = () => p.evaluate(() => window.__nav.slice());
  const reset = () => p.evaluate(() => { window.__nav = []; });

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").waitFor({ timeout: 8000 });
  const d0 = await db();
  const placesOf = (c) => d0.properties.filter((q) => q.customerId === c.id);
  const one = d0.customers.find((c) => placesOf(c).length === 1);
  h.expect(!!one, "the demo has a client with one address");

  // one address → straight to its measurement; no start screen, «назад» → the client
  await h.go(`/client/${one.id}`);
  await tid("module-gutters-measure").waitFor({ timeout: 8000 });
  await reset();
  await tid("module-gutters-measure").getByRole("button").click();
  await p.waitForURL((u) => u.pathname === "/module/gutters/draw" && u.searchParams.get("property") === placesOf(one)[0].id, { timeout: 8000 });
  const went = await navs();
  h.expect(!went.some((u) => u.startsWith(START)), `no start screen on the way (${went.join(" → ")})`);
  await h.shot("one-canvas");
  await p.goBack();
  await p.waitForURL((u) => u.pathname === `/client/${one.id}`, { timeout: 8000 });
  await tid("module-gutters-measure").waitFor({ timeout: 8000 });

  // several addresses → a sheet on the card, one transition. The demo has one address a client: the same client gets a second
  // one the way a person adds it (spec 27's «＋ Объект»)
  await tid("client-add-property").first().click();
  await h.sheet().getByPlaceholder("Улица и дом", { exact: true }).fill("515 Second St");
  await h.sheet().getByPlaceholder("Город", { exact: true }).fill("Pasadena");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await sheetGone(p);
  const many = one;
  {
    const added = async () => ((await db()).properties || []).find((q) => q.customerId === one.id && q.address === "515 Second St");
    await p.waitForFunction(([k, id]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.properties || []).some((q) => q.customerId === id && q.address === "515 Second St"), [DB_KEY, one.id], { timeout: 8000 });
    const second = await added();
    await h.go(`/client/${many.id}`);
    await tid("module-gutters-measure").waitFor({ timeout: 8000 });
    await reset();
    await tid("module-gutters-measure").getByRole("button").click();
    await tid(`module-gutters-measure-pick-${second.id}`).waitFor({ timeout: 8000 });
    h.expect(path() === `/client/${many.id}`, "the sheet opens on the client's card — no screen yet");
    await h.shot("pick");
    await tid(`module-gutters-measure-pick-${second.id}`).click();
    await p.waitForURL((u) => u.pathname === "/module/gutters/draw" && u.searchParams.get("property") === second.id, { timeout: 8000 });
    await sheetGone(p);
    const picked = await navs();
    h.expect(!picked.some((u) => u.startsWith(START)), `no start screen after the pick (${picked.join(" → ")})`);
    await p.goBack();
    await p.waitForURL((u) => u.pathname === `/client/${many.id}`, { timeout: 8000 });
  }

  // no address → the line under the button, nowhere to go
  const none = d0.customers.find((c) => placesOf(c).length === 0 && c.status !== "archived" && !c.mergedIntoId);
  if (none) {
    await h.go(`/client/${none.id}`);
    await tid("module-gutters-measure").waitFor({ timeout: 8000 });
    await reset();
    await tid("module-gutters-measure").getByRole("button").click();
    await tid("module-gutters-measure-note").waitFor({ timeout: 8000 });
    h.expect(path() === `/client/${none.id}` && !qp("property"), "the card stays");
    h.expect((await navs()).length === 0, "no transition");
    await h.shot("no-address");
  }
};
