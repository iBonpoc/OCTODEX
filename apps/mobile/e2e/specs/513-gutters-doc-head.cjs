/**
 * e2e 513 — #2159 (founder 18.11: «нет адреса, кому принадлежит»; «если это черновик, то тоже нужно обозначить»). Every view.
 * - a draft (tied to nobody): the client's drawing, the crew's cut, the shop drawings and the supplier's order each say
 *   «Черновик · без адреса» in the document's own language — never an empty head;
 * - tied to a lead with an address: each document says the lead's name and the lead's address (it was missing — only a
 *   client's property gave an address).
 * The web prints from a hidden frame: the spec reads the frame's HTML. Finds things by testID; waits on what it checks.
 */
const { skipLength, openView, stands, sheetGone } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {}, KEY);
  const catchPrint = () =>
    p.evaluate(() => {
      window.__pdf = null;
      for (const f of document.querySelectorAll("iframe")) f.dataset.seen = "1";
      if (window.__printHooked) return;
      window.__printHooked = true;
      const add = document.body.appendChild.bind(document.body);
      document.body.appendChild = (el) => {
        const r = add(el);
        if (el.tagName === "IFRAME") el.contentWindow.print = () => {};
        return r;
      };
    });
  const framed = (ms) =>
    p
      .waitForFunction(
        () => {
          const f = [...document.querySelectorAll("iframe:not([data-seen])")].find((x) => (x.contentDocument?.body?.innerHTML || "").length > 200);
          if (f) window.__pdf = f.contentDocument.documentElement.outerHTML;
          return !!window.__pdf;
        },
        null,
        { timeout: ms },
      )
      .then(() => true, () => false);
  /** press where the button stands, the paper's menu if any, and read the printed frame */
  const printVia = async (id, choice) => {
    const btn = tid(id).getByRole("button");
    await btn.scrollIntoViewIfNeeded();
    await stands(btn);
    await catchPrint();
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      await btn.click();
      if (choice) {
        const open = await tid(choice).waitFor({ timeout: 3000 }).then(() => true, () => false);
        if (!open) continue;
        await tid(choice).click();
        await p.getByTestId(choice).waitFor({ state: "hidden", timeout: 5000 });
      }
      ok = await framed(i < 2 ? 3000 : 8000);
    }
    h.expect(ok, `${id}: a printed frame`);
    return p.evaluate(() => window.__pdf);
  };
  const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const docs = async () => ({
    client: text(await printVia("view-pdf-client")),
    crew: text(await printVia("view-pdf-crew")),
    shop: text(await printVia("view-pdf-shop", "view-shop-paper-letter")),
    order: text(await printVia("view-pdf-shop-order")),
  });

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  const d0 = await db();
  const lead = d0.leads.find((l) => l.address && l.city && !["won", "lost", "declined"].includes(l.status));
  h.expect(!!lead, "the sample data has an open lead with an address");

  // a draft: one gutter, «Готово», the documents
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4, x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 10, y);
  await p.mouse.up();
  await skipLength(p);
  await tid("draw-to-lead").waitFor({ timeout: 6000 });
  const drawUrl = new URL(p.url());
  await openView(p);
  const draft = await docs();
  const draftWord = /Черновик · без адреса|Draft · no address|Borrador · sin dirección/i;
  for (const [k, v] of Object.entries(draft)) h.expect(draftWord.test(v), `a draft: the ${k} document says «Черновик · без адреса» (${v.slice(0, 160)})`);
  h.expect(/Draft · no address/i.test(draft.order), "the supplier's order says it in English");
  await h.shot("draft");

  // tied to the lead: its name and its own address on every document
  await h.go(drawUrl.pathname + drawUrl.search);
  await tid("draw-to-lead").waitFor({ timeout: 8000 });
  await tid("draw-to-lead").getByRole("button").click();
  await tid("link-sheet").waitFor({ timeout: 5000 });
  await tid("link-search").locator("input").fill(lead.name.split(" ")[0]);
  await tid(`link-lead-${lead.id}`).getByRole("button").click();
  await sheetGone(p);
  await tid("draw-lead").waitFor({ timeout: 6000 });
  await openView(p);
  const tied = await docs();
  for (const [k, v] of Object.entries(tied)) {
    // the shop sheets print the title block in capitals
    h.expect(v.toUpperCase().includes(lead.name.toUpperCase()), `the ${k} document names the lead (${lead.name})`);
    h.expect(v.toUpperCase().includes(lead.address.toUpperCase()), `the ${k} document has the lead's address (${lead.address})`);
    h.expect(!draftWord.test(v), `the ${k} document is not marked a draft`);
  }
  await h.shot("lead");
};
