/**
 * e2e 440 — the forms of PR-3c (#1728) stand in the form column (DS §12.3, `<Screen form>`), the director, every view, by testID:
 * on every form the column is not wider than 560 (`layout.formMax`), still fills the phone, and stands on the left line
 * of the screens' 1200 column (not centred in the window) on 820 and 1280.
 */
const FORMS = [
  "/auth/terms",
  "/client/edit?id=c1",
  "/client/edit",
  "/client/import",
  "/company/profile",
  "/company/schedule",
  "/company/checklist/tpl-job",
  "/expense/new",
  "/job/new",
  "/job/schedule?jobId=j1",
  "/lead/new",
  "/settings/delete-account",
  "/purchase-order/po-demo-1",
  "/suppliers/sup-hd",
];

exports.run = async (h) => {
  const p = h.page;
  const W = h.layout.width;
  for (const path of FORMS) {
    await h.go(path);
    const col = p.getByTestId("form-column").locator("visible=true").first();
    await col.waitFor({ timeout: 8000 });
    const box = await col.boundingBox();
    h.expect(box.width <= 560.5, `${path}: the column is at most 560 wide (${box.width})`);
    h.expect(box.width >= Math.min(W - 40, 340), `${path}: the column still fills the phone (${box.width})`);
    if (W >= 820) {
      // the left line of the screens' column, not the middle of the window: a column centred in the window would start at (W - 560) / 2
      const centred = (W - box.width) / 2;
      h.expect(box.x < centred - 20 || W - box.width < 40, `${path}: the column stands on the left line (x ${Math.round(box.x)}, centred would be ${Math.round(centred)})`);
    }
  }
  await h.go("/client/edit?id=c1");
  await p.getByTestId("form-column").locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.shot("client-edit");
};
