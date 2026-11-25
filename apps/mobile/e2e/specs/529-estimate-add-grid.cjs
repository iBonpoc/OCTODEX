/**
 * e2e 529 — the ways to add, two by two (audit wave 1 п.6, founder 23.11; DS §8.2а), every view, by testID:
 * - an empty estimate: the four buttons in its card — «＋ Позиция · ＋ Раздел» over «Каталог · Шаблон», no «˅» menu;
 * - «＋ Раздел» in an empty estimate shows the new section with its name field (code review: it used to be made unseen);
 * - «Вариант» is in the editor's «⋯».
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const box = async (id) => tid(id).boundingBox();
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-empty").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("est-add-layers").count()) === 0, "no «˅» menu");
  const [n, s, c, t] = [await box("est-add-new"), await box("est-add-section"), await box("est-add-catalog"), await box("est-from-template")];
  const mid = (b) => b.y + b.height / 2;
  // two by two where the pair fits a row (ButtonPair stands its two in a column only when the words do not fit — not at these widths in RU)
  h.expect(Math.abs(mid(n) - mid(s)) < 2 && Math.abs(mid(c) - mid(t)) < 2 && mid(c) > mid(n), `two rows of two (${[n, s, c, t].map((b) => Math.round(mid(b))).join(", ")})`);
  h.expect(n.x < s.x && c.x < t.x && Math.abs(n.x - c.x) < 2, "«＋ Позиция» over «Каталог», «＋ Раздел» over «Шаблон»");
  await h.shot("empty");

  // «Вариант» is in «⋯»
  await tid("est-menu").getByRole("button").click();
  await tid("est-add-option").waitFor({ timeout: 3000 });
  await require("../sheet.cjs").pressEscUntilClosed(p, tid("menu-items"));

  // «＋ Раздел» in the empty estimate: the section and its name field are seen
  await tid("est-add-section").getByRole("button").click();
  await p.locator('[data-testid^="est-sec-name-"]').locator("visible=true").first().waitFor({ timeout: 3000 });
  h.expect((await p.locator('[data-testid^="est-sec-name-"]').locator("visible=true").count()) === 1, "the new section's name field is on the screen");
};
