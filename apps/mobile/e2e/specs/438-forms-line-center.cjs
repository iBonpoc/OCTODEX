/**
 * e2e 438 — forms and the client's request page, the rest of #1728 (DS §19.3, Б10, 1.15.8), every view, by testID:
 * - the request form /f/: on 820/1280 the 560 column with its title stands in the middle of the screen (was at the left,
 *   the right side empty); on every width one step under the title — languages → the company's card → the fields, equal;
 * - 1280: an estimate with a long name opened beside the list — its name in the panel's header and on its card is not cut
 *   short with «…» (three lines, not two).
 */
const TOKEN = "f0123456789abcdef0123456789abcdef";

exports.run = async (h) => {
  const p = h.page;
  const W = h.layout.width;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await p.route("**/functions/v1/lead-intake*", async (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, form: { company: "Sunset Gutters", language: "en", captcha: false, sms_consent: false, categories: [] } }) }),
  );

  // /f/: the column in the middle on a wide screen; one step under the title
  await h.go(`/f/${TOKEN}`);
  await tid("intake-fields").waitFor({ timeout: 8000 });
  const col = await tid("intake-fields").boundingBox();
  const title = await p.getByText("Request a quote", { exact: true }).locator("visible=true").first().boundingBox();
  h.expect(col.width <= 560 + 1, `/f/: the column is at most 560 (${col.width})`);
  h.expect(Math.abs(title.x - col.x) <= 2, `/f/: the title on the column's line (${title.x} / ${col.x})`);
  if (W > 390) h.expect(Math.abs(col.x + col.width / 2 - W / 2) <= 2, `/f/: the column in the middle (${col.x}…${col.x + col.width} of ${W})`);
  const lang = await tid("intake-lang").boundingBox();
  const card = await p.getByText("Sunset Gutters", { exact: true }).locator("visible=true").first().evaluate((e) => {
    let a = e;
    while (a && !(parseFloat(getComputedStyle(a).borderTopLeftRadius) > 8)) a = a.parentElement;
    const r = a.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  const a = card.top - (lang.y + lang.height);
  const b = col.y - card.bottom;
  h.expect(Math.abs(a - b) <= 2, `/f/: one step under the title — languages→card ${a}, card→fields ${b}`);
  await h.shot("f");

  // 1280: a long estimate name beside the list is whole
  if (W >= 1280) {
    await h.go("/estimates?f=all&open=e6");
    await tid("list-panel").waitFor({ timeout: 8000 });
    await p.getByText(/EST-0006 · Carpet, railing, bulb, haul-away/).locator("visible=true").first().waitFor({ timeout: 8000 });
    const cut = await tid("list-panel").evaluate((panel) =>
      [...panel.querySelectorAll('div[dir="auto"]')]
        .filter((t) => /Carpet, railing, bulb, haul-away/.test(t.textContent ?? ""))
        .filter((t) => t.scrollHeight > t.clientHeight + 1)
        .map((t) => t.textContent),
    );
    h.expect(cut.length === 0, `the panel: the estimate's name is not cut short (${cut.join(" | ")})`);
    await h.shot("panel");
  }
};
