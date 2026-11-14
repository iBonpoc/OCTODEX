/**
 * e2e 390 — the company's settings sections are forms whose fields lie straight on the background (DS §11 п.17, #1455, the
 * continuation of #1411), the director, every view, by testID:
 * - each group of fields (profile, address, insurance, documents, brand) has no plate between it and the screen's column;
 * - the group is as wide as the screen's «Сохранить» (no card eats 2 × 16 of the field's width);
 * - an opened editor of a list (a person, a license) is a group without a plate too, and still saves.
 */
const GROUPS = {
  "/company/profile": ["co-group-profile"],
  "/company/address": ["co-group-address", "co-group-mailing"],
  "/company/insurance": ["co-group-cgl", "co-group-wc", "co-group-cancel"],
  "/company/documents": ["co-group-doclang", "co-group-estimate", "co-group-terms", "co-group-payment"],
  "/company/brand": ["co-group-logo", "co-group-color"],
};

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  // the nearest background painted between a group and the column that also holds `stop` (the save button or the add button)
  const plateUnder = (id, stop) =>
    p.evaluate(
      ([gid, sid]) => {
        const el = [...document.querySelectorAll(`[data-testid="${gid}"]`)].find((e) => e.offsetParent !== null);
        if (!el) return "missing";
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (a.querySelector(`[data-testid="${sid}"]`)) return null;
          const bg = getComputedStyle(a).backgroundColor;
          if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
        }
        return null;
      },
      [id, stop],
    );

  for (const [path, groups] of Object.entries(GROUPS)) {
    await h.go(path);
    await tid("co-save").waitFor({ timeout: 8000 });
    const save = await tid("co-save").boundingBox();
    for (const g of groups) {
      await tid(g).waitFor({ timeout: 3000 });
      h.expect((await plateUnder(g, "co-save")) === null, `${path}: no plate under «${g}»`);
      const b = await tid(g).boundingBox();
      h.expect(Math.abs(b.x - save.x) <= 1 && Math.abs(b.width - save.width) <= 1, `${path}: «${g}» spans the column like «Сохранить» (${b.x}/${b.width} vs ${save.x}/${save.width})`);
    }
  }
  await h.shot("documents");

  // a list's editor: «Добавить человека» opens a group without a plate; it saves the person
  await h.go("/company/contacts");
  await p.getByRole("button", { name: "Добавить человека" }).locator("visible=true").first().click();
  await tid("co-contact-edit").waitFor({ timeout: 3000 });
  // the editor itself and what holds it paint no background (a card would)
  const bgs = await tid("co-contact-edit").evaluate((e) => [e, e.parentElement].map((x) => getComputedStyle(x).backgroundColor));
  h.expect(bgs.every((bg) => bg === "transparent" || bg === "rgba(0, 0, 0, 0)"), `the person's editor has no plate (${bgs.join(", ")})`);
  await tid("co-contact-edit").locator("input").first().fill("E2E Person 390");
  await tid("co-contact-edit").getByRole("button", { name: "Сохранить" }).click();
  await tid("co-contact-edit").waitFor({ state: "hidden", timeout: 3000 });
  // saved: the person is a card of the list now
  await p.getByRole("button", { name: "E2E Person 390" }).locator("visible=true").first().waitFor({ timeout: 4000 });

  await h.go("/company/licenses");
  await p.getByRole("button", { name: "Добавить лицензию" }).locator("visible=true").first().click();
  await tid("co-license-edit").waitFor({ timeout: 3000 });
  await h.shot("license-editor");
};
