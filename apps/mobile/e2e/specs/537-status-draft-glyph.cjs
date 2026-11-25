/**
 * e2e 537 — #2500 (DS §3.3, ДС 1.42.0): the grey status has two glyphs. A draft shows the dashed ring (`draft`), «Нет сметы» the
 * ring with a dash (`neutral`) — two different drawings under one grey. The word of a status plate is 13 (`caption`), and an
 * overdue «Срок» says «Просрочен 9 дн», not «−9 дн». Shown live in the showcase («Прототипы» → plates; «Значки»), every view.
 * The data side (what is a draft) — test/statusDraft.test.ts.
 */
const DASHED = /^M13\.10 3\.07/;
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  // a plate's first path: the glyph; the word's size — its computed font size
  const glyphOf = async (id) => vis(id).locator("path").first().getAttribute("d");
  const sizeOf = async (id) => vis(id).evaluate((el) => {
    const w = [...el.querySelectorAll("*")].find((n) => n.children.length === 0 && n.textContent.trim());
    return parseFloat(getComputedStyle(w).fontSize);
  });

  await h.go("/settings/design-system/proto");
  await vis("showcase-pill-press").waitFor({ timeout: 8000 });
  const draft = await glyphOf("showcase-pill-press");
  const none = await glyphOf("showcase-pill-none");
  h.expect(DASHED.test(draft ?? ""), `«Черновик» — the dashed ring (${draft?.slice(0, 20)})`);
  h.expect(!!none && !DASHED.test(none) && /h8$/.test(none), `«Отменён» — the ring with a dash, not the dashed one (${none?.slice(-20)})`);
  h.expect((await sizeOf("showcase-pill-press")) >= 13, "the word of the plate is 13, not 12");

  await h.go("/settings/design-system/proto");
  await p.getByText(/Просрочен 9 дн|Overdue 9 d/).first().waitFor({ timeout: 8000 });
  h.expect(!(await p.getByText(/−9 дн/).count()), "no bare «−9 дн» is left in the showcase");
  await h.shot("draft-and-none");
};
