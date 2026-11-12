/**
 * e2e 255 — one format of lengths for the company (#1092, founder 12.11: «везде так, как выбрано в настройках»). Every view.
 * - director, the trial on, «Настройки» → «Формат длины»: «Миллиметры» chosen — saved in the company's settings, the sample says it;
 * - an L on the canvas → «Просмотр замера»: the sheet's dimension lines and the walls / faces are in mm, no feet;
 * - «PDF клиенту» and «PDF бригаде»: the same, parts too;
 * - back to «Футы и дюймы»: the review is in feet-inches again (the setting is the company's, one place).
 * Finds things by testID and by the order of the chips (rule 19); waits on what it checks.
 */
const { skipLength, openView, pressWhenStill } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const settings = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.settings) || {}, KEY);
  const lenFormatIs = (v) => p.waitForFunction(([k, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.settings?.lenFormat) === want, [KEY, v], { timeout: 8000 });
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  /** the next frame printed: its HTML (the print dialog is not opened) */
  const printed = async (id) => {
    await p.evaluate(() => {
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
    await tid(id).getByRole("button").click();
    await p.waitForFunction(
      () => {
        const f = [...document.querySelectorAll("iframe:not([data-seen])")].find((x) => x.contentDocument?.body?.innerHTML.includes("<svg"));
        if (f) window.__pdf = f.contentDocument.documentElement.outerHTML;
        return !!window.__pdf;
      },
      null,
      { timeout: 10000 },
    );
    return p.evaluate(() => window.__pdf);
  };
  const sheetText = () => tid("view-svg").innerText();

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction(() => /^Пробный/.test((document.querySelector('[data-testid="module-gutters-status"]')?.textContent ?? "").trim()), null, { timeout: 8000 });

  // the setting: feet-inches by default; «Миллиметры» is the fifth item of the field's menu
  await h.go("/module/gutters/settings");
  await tid("gset-len-format").waitFor({ timeout: 8000 });
  h.expect((await tid("gset-len-sample").innerText()).includes("′"), "feet and inches is the default (the sample shows feet)");
  await tid("gset-len-format-button").click();
  await tid("gset-len-format-mm").click();
  await lenFormatIs("mm");
  h.expect((await tid("gset-len-sample").innerText()).includes("mm"), "the sample is in mm");
  await h.shot("len-format-settings");

  // an L, then the review in mm
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  const x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await stroke([x0, y], [x1, y]);
  await stroke([x1, y], [x1, y + b.height * 0.2]);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] line:not([id^=halo])').length >= 2, null, { timeout: 8000 });
  await tid("draw-done").waitFor({ timeout: 8000 });
  await openView(p);
  const mm = await sheetText();
  h.expect(/\d+ mm/.test(mm) && !/\d′/.test(mm), "the sheet: lengths in mm, no feet: " + mm.slice(0, 80));
  // the lists are folded under «Подробно»
  await pressWhenStill(tid("view-details").getByRole("button"));
  await tid("view-parts").waitFor({ timeout: 5000 });
  const runs = await tid("view-run-1").innerText();
  h.expect(/mm/.test(runs) && !/′/.test(runs), "the wall and the face in mm: " + runs);
  await h.shot("len-format-view");

  const client = await printed("view-pdf-client");
  h.expect(/\d+ mm/.test(client) && !/\d′/.test(client.slice(client.indexOf("<table"))), "PDF for the client: mm");
  const crew = await printed("view-pdf-crew");
  const body = crew.slice(crew.indexOf("Желоба"));
  h.expect(/\d+ mm/.test(body) && !/\d′/.test(body), "PDF for the crew: mm in the walls, corners and parts");

  // back to feet-inches: one setting, one place
  await h.go("/module/gutters/settings");
  await tid("gset-len-format").waitFor({ timeout: 8000 });
  await tid("gset-len-format-button").click();
  await tid("gset-len-format-ftin").click();
  await lenFormatIs("ftin");
  h.expect((await settings()).lenFormat === "ftin", "feet and inches saved");
};
