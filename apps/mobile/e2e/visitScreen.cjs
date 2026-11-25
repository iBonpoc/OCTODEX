/**
 * The visit screen (v2 #2350, the Object template, src/app/visit/[id].tsx) in a spec.
 * The ONE main step is a button in the work card with its own testID: `visit-main-en-route` (В пути) → `visit-main-on-site`
 * (На месте) → `visit-main-work` (Начать) → `visit-main-finish` (Завершить → the signature pad) → `visit-record-payment`
 * (Принять · $X) / `visit-close` (Закрыть выезд) / `visit-hand-off` (Передать офису); `visit-main-done` (an inspection on site),
 * `visit-main-estimate` (after an inspection). Rare and dangerous are items of the header's «⋯» (`visit-screen-more`):
 * `visit-act-checklist`, `visit-act-add-item`, `visit-no-show`, `visit-act-back-to-work`, `visit-act-cancel`.
 * `visitStep(p, key)` presses the step (`en-route` | `on-site` | `work` | `finish` | `done` | `estimate` or a full testID);
 * `visitAct(p, testID)` opens «⋯» and presses the item; `visitHas(p, testID)` — the item is in «⋯» (opens and closes it);
 * `visitCreate(p, key)` — an item of «＋»; `visitCameraAdd(p)` — «＋ → Фото» → the sheet's «Добавить фото» (the file chooser).
 */
const { pressEscUntilClosed } = require("./sheet.cjs");
const { settle } = require("./settle.cjs");

const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();
const STEP = { "en-route": "visit-main-en-route", "on-site": "visit-main-on-site", work: "visit-main-work", finish: "visit-main-finish", done: "visit-main-done", estimate: "visit-main-estimate", pay: "visit-record-payment", close: "visit-close", "hand-off": "visit-hand-off" };

async function visitStep(p, key, timeout = 8000) {
  const b = vis(p, STEP[key] ?? key);
  await b.waitFor({ timeout });
  await b.click();
  await settle(p, { quietMs: 120, maxMs: 2000 });
}

const more = (p) => vis(p, "visit-screen-more");
async function openMenu(p) {
  await more(p).waitFor({ timeout: 8000 });
  await more(p).getByRole("button").first().click();
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
}

async function visitAct(p, id) {
  await openMenu(p);
  await vis(p, id).click();
  // the item runs once the menu is gone (menuPick)
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
  // a dangerous item (red, `destructive`) asks first — the template's confirm sheet (v2 MoreButton)
  if (DANGEROUS.has(id)) await vis(p, "tpl-confirm-yes").click();
}
const DANGEROUS = new Set(["visit-act-cancel"]);

async function visitHas(p, id) {
  if ((await p.getByTestId("visit-screen-more").locator("visible=true").count()) === 0) return false;
  await openMenu(p);
  const has = (await p.getByTestId(id).locator("visible=true").count()) > 0;
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
}

// «＋» of the header (`visit-screen-create`): its items are `visit-create-<key>` (photo · estimate · lead · expense); once the
// header has folded on a scroll, the «＋» items are the top of «⋯» (ObjectRight)
async function visitCreate(p, key) {
  const plus = p.getByTestId("visit-screen-create").locator("visible=true");
  if (await plus.count()) await plus.first().getByRole("button").first().click();
  else await openMenu(p);
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
  await vis(p, `visit-create-${key}`).click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
}

/** «＋ → Фото» opens the step's photos in a sheet (`visit-camera-sheet`); `[chooser]` of its «Добавить фото» */
async function visitCameraAdd(p) {
  await visitCreate(p, "photo");
  const sheet = vis(p, "visit-camera-sheet");
  await sheet.waitFor({ timeout: 5000 });
  return Promise.all([p.waitForEvent("filechooser"), sheet.getByRole("button", { name: "Добавить фото" }).first().click()]);
}

module.exports = { visitStep, visitAct, visitHas, visitCreate, visitCameraAdd };
