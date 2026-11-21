/**
 * e2e 386 — the invoice's card as LAYOUT-RULES §3 «Объект» (#2350; before — #1474, DS Б4), an owed invoice of a client with a phone
 * and an email, as the director, every view, by testID:
 * - the secondary actions are icons in ONE row on the page (SMS · email · PDF · «Напомнить»), each with its VoiceOver label;
 * - one main button «Принять оплату · $X»: on a phone pinned alone at the bottom (no tab bar under it), from 820 right after the
 *   money, as wide as its words;
 * - «⋯» holds only the rare and dangerous «Аннулировать…»;
 * - «Напомнить» opens its sheet.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const phone = h.layout.width < 820;

  await h.go("/invoice");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const inv = raw.db.invoices.find((i) => i.totalCents > i.paidCents && raw.db.customers.some((c) => c.id === i.customerId && c.phone));
  h.expect(inv, "demo has an owed invoice of a client with a phone");
  // the client gets an email too: every way to send is offered
  const cust = raw.db.customers.find((c) => c.id === inv.customerId);
  cust.email = cust.email || "e2e386@example.com";
  await h.seed("octo.db.v5", raw);

  await h.go(`/invoice/${inv.id}`);
  await tid("invoice-more").waitFor({ timeout: 8000 });
  // the icons: one row, each a labelled button
  const icons = [];
  for (const id of ["invoice-act-sms", "invoice-act-email", "invoice-act-pdf", "invoice-remind"]) {
    await tid(id).waitFor({ timeout: 3000 });
    const label = await tid(id).getByRole("button").getAttribute("aria-label");
    h.expect(label && label.length > 2, `«${id}» is an icon with a VoiceOver label (${label})`);
    icons.push(await tid(id).boundingBox());
  }
  h.expect(icons.every((b) => Math.abs(b.y - icons[0].y) <= 2) && icons.every((b, i) => i === 0 || b.x > icons[i - 1].x), "the icons stand in one row");

  // the main button: pinned alone on a phone, after the money from 820
  await tid("invoice-take-payment").waitFor({ timeout: 3000 });
  h.expect(/Принять оплату · \$/.test(await tid("invoice-take-payment").innerText()), "the main button names the sum");
  h.expect((await p.getByTestId("invoice-actionbar").locator("visible=true").count() > 0) === phone, phone ? "«Принять оплату» is in the pinned bar" : "no pinned bar from 820");
  if (phone) {
    const bar = await tid("invoice-actionbar").boundingBox();
    const vp = p.viewportSize();
    h.expect(bar && Math.abs(bar.y + bar.height - vp.height) <= 2, `the bar stands on the bottom edge (${bar && bar.y + bar.height} / ${vp.height})`);
    h.expect((await p.getByTestId("tab-bar").locator("visible=true").count()) === 0, "no tab bar under the pinned bar");
    const pay = await tid("invoice-take-payment").boundingBox();
    h.expect(pay && pay.y >= bar.y && pay.width > bar.width / 2, "one main button across the bar");
  } else {
    const btn = await tid("invoice-take-payment").boundingBox();
    h.expect(btn && btn.width < 400, `from 820 the button is as wide as its words (${btn && btn.width})`);
  }
  await h.shot("card");

  // «⋯»: only «Аннулировать…»
  await tid("invoice-more").getByRole("button").click();
  await tid("menu-items").waitFor({ timeout: 3000 });
  const inMenu = await p.evaluate(() =>
    [...document.querySelectorAll('[data-testid="menu-items"] [data-testid]')].filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("data-testid")).filter((x) => /^invoice-/.test(x)),
  );
  h.expect(JSON.stringify(inMenu) === JSON.stringify(["invoice-void-item"]), `«⋯» holds only «Аннулировать…»: ${inMenu.join(", ")}`);
  await h.shot("menu");
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  // «Напомнить» opens its sheet
  await tid("invoice-remind").getByRole("button").click();
  const remindSheet = p.locator('[aria-modal="true"]').filter({ hasText: "Напомнить клиенту" }).last();
  await remindSheet.waitFor({ timeout: 4000 });
};
