/**
 * Catalog on the new list cards (step 10а, PR6), every view (3 widths × 2 themes).
 * - card: name, «$X / unit», kind and «тестовая цена» as grey tags, supplier, description; no «…»; edges aligned;
 * - the office sees «Себестоимость» and «Маржа» tiles (always both); the technician sees the price but never cost or margin
 *   (spec 06 §7.6 exception for the catalog: the price is needed for an estimate on site);
 * - groups by kind under «All»;
 * - «В убытке» (catalogItemEconomics, #98): a service priced below its cost → the office sees the sign, a red edge and a
 *   negative margin; other cards have a real cost and margin, not «—»; the technician sees no sign.
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/catalog");
  const db = await h.db();
  const it = db.catalog.find((x) => x.vendor && x.kind !== "kit") ?? db.catalog[0];
  const card = p.locator('[data-testid="list-card"]').filter({ hasText: it.name }).first();
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  h.expect(txt.includes(it.name) && new RegExp(`\\$[\\d,.]+ / ${it.unit}`).test(txt), `name and «$X / ${it.unit}»: ${txt.slice(0, 200)}`);
  if (it.vendor) h.expect(txt.includes(it.vendor), "supplier on the card");
  if (it.placeholder) h.expect(txt.includes("тестовая цена"), "«тестовая цена» tag");
  h.expect(txt.includes("Себестоимость") && txt.includes("Маржа"), "office: cost and margin tiles");
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…»");
  await h.expectText(/Материал · \d+|Услуга · \d+/, "groups by kind under «All»");
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { searchPlaceholder: "Поиск в каталоге" });
  await h.shot("list");

  // real economics, not the old stub: a material with a supplier has a cost and a margin
  h.expect(/Себестоимость[\s\S]*\$[\d,.]+/.test(txt) && /Маржа[\s\S]*\d+\.\d%/.test(txt), `cost and margin are computed: ${txt.slice(0, 240)}`);

  // «В убытке»: a service priced below its cost (test prices)
  const LOSS = "Loss test service";
  await p.evaluate((name) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.catalog.push({ id: "cat-loss-e2e", kind: "service", name, unit: "ea", priceCents: 9000, costCents: 10000, placeholder: true });
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, LOSS);
  await h.go("/catalog");
  const lossCard = p.locator('[data-testid="list-card"]').filter({ hasText: LOSS }).first();
  await lossCard.scrollIntoViewIfNeeded();
  const lt = await lossCard.innerText();
  h.expect(lt.includes("В убытке") && lt.includes("-11.1%") && /\$100(\.00)?\b/.test(lt), `loss sign, cost $100 and margin -11.1%: ${lt.slice(0, 240)}`);
  // the status edge: an absolute strip on the card's left side, a few px wide, full height
  const hasEdge = (loc) => loc.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return [...e.querySelectorAll("div")].some((d) => {
      const b = d.getBoundingClientRect(), st = getComputedStyle(d);
      return st.position === "absolute" && Math.abs(b.left - r.left) <= 1 && b.width > 0 && b.width <= 6 && b.height >= r.height - 2;
    });
  });
  const edge = await hasEdge(lossCard);
  h.expect(edge, "red edge on the loss card");
  h.expect(!(await card.innerText()).includes("В убытке") && !(await hasEdge(card)), "a card with a margin has no loss sign or edge");
  await h.shot("loss");

  // technician: price yes, cost and margin no, no loss sign
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/catalog");
  const body = await p.locator("body").innerText();
  h.expect(/\$[\d,.]+ \//.test(body), "tech sees the selling price");
  h.expect(!body.includes("Себестоимость") && !body.includes("Маржа"), "tech never sees cost or margin");
  h.expect(body.includes(LOSS) && !body.includes("В убытке"), "tech never sees «В убытке»");
};
