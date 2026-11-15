/**
 * e2e 409 — the visit of a technician has no «＋»: «Расход» and «Фото» are a pinned panel (#1395 group 3, DS §8.9 «Панель выезда мастера»);
 * the estimate (an inspection) and the lead are in the header's «⋯». Every view, by testID:
 * - 390: the panel is pinned to the bottom, two secondary buttons in a row (2 : 3), no tab bar, no «＋»; 820/1280: the same two buttons in the page's column;
 * - «Расход» opens /expense/new; «Фото» opens the picker and the photo is kept on the visit;
 * - «⋯» has «Лид» and, on an inspection, «Создать смету»; the office gets no panel (and the estimate only on an inspection).
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  const anyFab = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');

  await h.seed("octo.role.v1", "tech");
  await h.go("/today");
  const db = await h.db();
  const mine = db.visits.find((v) => v.techId === db.me && v.kind !== "inspection" && v.step === "scheduled" && !v.photos.length);
  h.expect(!!mine, "a visit of mine without photos");
  await h.go(`/visit/${mine.id}`);
  await vis("visit-screen").first().waitFor({ timeout: 8000 });
  h.expect((await anyFab().count()) === 0, "the visit has no «＋»");

  const exp = vis("visit-bar-expense").first();
  const pho = vis("visit-bar-photo").first();
  await exp.waitFor({ timeout: 8000 });
  const be = await exp.boundingBox();
  const bp = await pho.boundingBox();
  h.expect(Math.abs(be.y - bp.y) < 2, "«Расход» and «Фото» stand in one row");
  h.expect(be.x < bp.x, "«Расход» on the left, «Фото» on the right");
  if (!wide) {
    h.expect((await vis("visit-actionbar").count()) === 1, "390: the panel is pinned");
    const bar = await vis("visit-actionbar").first().boundingBox();
    h.expect(bar.y + bar.height >= p.viewportSize().height - 2, `390: the panel is at the bottom (${bar.y + bar.height} of ${p.viewportSize().height})`);
    h.expect(be.width < bp.width, `390: widths 2 : 3 (${Math.round(be.width)} / ${Math.round(bp.width)})`);
    h.expect(be.height >= 43 && bp.height >= 43, "390: the panel buttons are 44 high");
    h.expect((await vis("tab-bar").count()) === 0, "390: no tab bar under the panel");
  } else {
    h.expect((await vis("visit-actionbar").count()) === 0, "820/1280: no pinned bar, the buttons stand in the column");
  }
  await h.shot("visit-panel");

  // «Фото»: the picker, the photo stays on the visit
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), pho.click()]);
  await chooser.setFiles({ name: "p.png", mimeType: "image/png", buffer: PNG });
  for (let i = 0; i < 40; i++) {
    if (((await h.db()).visits.find((v) => v.id === mine.id)?.photos?.length ?? 0) === 1) break;
    await p.waitForTimeout(150);
  }
  h.expect(((await h.db()).visits.find((v) => v.id === mine.id)?.photos?.length ?? 0) === 1, "«Фото»: the photo is kept on the visit");

  // «⋯»: «Лид»; no estimate on a plain visit
  await vis("visit-more").first().click();
  await vis("visit-act-lead").first().waitFor({ timeout: 5000 });
  h.expect((await vis("visit-act-estimate").count()) === 0, "a plain visit: no «Создать смету» in «⋯»");
  await h.shot("visit-more");
  await vis("visit-act-lead").first().click();
  await p.waitForURL(/\/lead\/new/, { timeout: 5000 });

  // «Расход»
  await h.go(`/visit/${mine.id}`);
  await vis("visit-bar-expense").first().click();
  await p.waitForURL(/\/expense\/new/, { timeout: 5000 });

  // an inspection: «⋯» has the estimate too
  const insp = db.visits.find((v) => v.kind === "inspection" && (v.leadId || v.jobId));
  if (insp) {
    await h.go(`/visit/${insp.id}`);
    await vis("visit-more").first().click();
    await vis("visit-act-estimate").first().waitFor({ timeout: 5000 });
    await vis("visit-act-estimate").first().click();
    await p.waitForURL(/\/estimate\/new/, { timeout: 5000 });
  }

  // the office: no panel, no «＋»
  await h.seed("octo.role.v1", "director");
  await h.go(`/visit/${mine.id}`);
  await vis("visit-screen").first().waitFor({ timeout: 8000 });
  h.expect((await vis("visit-bar-photo").count()) === 0 && (await vis("visit-bar-expense").count()) === 0, "the office: no «Расход» / «Фото» panel");
  h.expect((await anyFab().count()) === 0, "the office: no «＋» on the visit");
};
