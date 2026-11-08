/**
 * e2e 165 — крепёж и расходники поставщика в настройках Gutters (docs/specs/33-gutters-parts.md П18.15, V1). Every view.
 * - director, the trial on, «Настройки» → «Расходники»: wood screw #10 × 2″ with a washer, anchor ¼ × 1″, spike lengths
 *   on (off by default) and 7½″ for a 6″ gutter, sealant in the joint's color — each saved in the company's module settings;
 * - «Цены и прайс»: plain sealant before; after the switch the sealant row is the joint's color (white), the plain one gone.
 * Chips by place, not by words (rule 19); waits on what it checks.
 */
const KEY = "octo.db.v5";
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {}, KEY);
  const use = async () => ((await db()).company?.modules?.gutters?.settings?.use) || {};
  // chips of WOOD_SCREWS 10x1 · 10x1.5 · 10x2; ANCHORS any · 3/16x7/8 · 1/4x1; SPIKE_LENGTHS 6.5 · 7 · 7.5 · 8 · 9 · 10
  const nth = (field, n) => tid(field).getByRole("radio").nth(n);
  const chosenAt = (field) => tid(field).getByRole("radio").evaluateAll((rs) => rs.findIndex((r) => r.getAttribute("aria-checked") === "true"));
  const flip = (field) => tid(field).getByRole("switch").click();
  const prices = async () => {
    await h.go("/module/gutters/prices");
    await tid("gpr-parts").waitFor({ timeout: 8000 });
  };

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");

  await prices();
  await waitFor(async () => (await tid("gpr-miss-sealant").count()) === 1, "plain sealant by default");
  h.expect((await tid("gpr-miss-sealant.white").count()) === 0, "no colored sealant by default");

  await h.go("/module/gutters/settings");
  await tid("gset-use").waitFor({ timeout: 8000 });
  h.expect((await chosenAt("gset-use-woodScrew")) === 1 && (await chosenAt("gset-use-anchor")) === 0, "defaults: #10 × 1½″, any anchor");
  h.expect((await tid("gset-use-spike-6").count()) === 0, "spike lengths are off by default");
  await tid("gset-use-woodScrew").scrollIntoViewIfNeeded();
  await nth("gset-use-woodScrew", 2).click();
  await waitFor(async () => (await use()).woodScrew === "10x2", "#10 × 2″ saved");
  await flip("gset-use-washer");
  await waitFor(async () => (await use()).washer === true, "the washer saved");
  await nth("gset-use-anchor", 2).click();
  await waitFor(async () => (await use()).anchor === "1/4x1", "¼ × 1″ anchor saved");
  await flip("gset-use-spikeBySize");
  await waitFor(async () => (await use()).spikeBySize === true, "spike lengths on");
  await tid("gset-use-spike-6").waitFor({ timeout: 5000 });
  h.expect((await chosenAt("gset-use-spike-6")) === 3, "the 6″ gutter's spike is 8″ by default");
  await tid("gset-use-spike-6").scrollIntoViewIfNeeded();
  await nth("gset-use-spike-6", 2).click();
  await waitFor(async () => (await use()).spikeLenIn?.["6"] === "7.5", "7½″ spike for a 6″ gutter saved");
  await flip("gset-use-sealantColor");
  await waitFor(async () => (await use()).sealantByColor === true, "sealant by color saved");
  await h.shot("fasteners");

  await prices();
  await waitFor(async () => (await tid("gpr-miss-sealant.white").count()) === 1, "the sealant row is the joint's color");
  h.expect((await tid("gpr-miss-sealant").count()) === 0, "the plain sealant row is gone");
};
