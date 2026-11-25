/**
 * e2e 421 — the forms' frame, column and main button (DS §11 п.17, §12.3, #1594), the director, every view, by testID:
 * - the frame of an input field is the `bdField` token of the theme (≥ 3:1 to the screen, not the quiet `bd`);
 * - on sign-in, «Создать компанию» and the public request form /f/ the column is not wider than 560 (`layout.formMax`);
 * - the main button of the request form stands apart from the fields: at least 11 more than the gap between two fields (`space[4]` on top of the usual gap).
 */
const TOKEN = "f0123456789abcdef0123456789abcdef";
// `bdField` of the v2 themes (packages/design-tokens: dark #80838C, light #6F7279; #2350 — solid, no longer a white/ink alpha)
const FRAME = { dark: "rgb(128, 131, 140)", light: "rgb(111, 114, 121)" };

exports.run = async (h) => {
  const p = h.page;
  await p.route("**/functions/v1/lead-intake*", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, form: { company: "Sunset Gutters", language: "en", captcha: false, sms_consent: false, categories: [] } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const frameOf = (id) =>
    tid(id).evaluate((root) => {
      const input = root.querySelector("input, textarea");
      for (let a = input; a && a !== root.parentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (parseFloat(s.borderTopWidth) >= 1 && s.borderTopColor !== "rgba(0, 0, 0, 0)") return s.borderTopColor;
      }
      return "none";
    });
  const check = async (path, group) => {
    await h.go(path);
    await tid(group).waitFor({ timeout: 8000 });
    const w = (await tid(group).boundingBox()).width;
    h.expect(w <= 560.5, `${path}: the column is at most 560 wide (${w})`);
    h.expect(w >= Math.min(h.layout.width - 40, 340), `${path}: the column still fills the phone (${w})`);
    const frame = await frameOf(group);
    h.expect(frame === FRAME[h.layout.theme], `${path}: the field frame is bdField (${frame})`);
  };
  await check("/auth/sign-in", "auth-fields");
  await h.shot("sign-in");
  await check("/auth/company", "company-fields");
  await check(`/f/${TOKEN}`, "intake-fields");
  await h.shot("intake");
  // the main button is set apart from the fields
  const gaps = await p.evaluate(() => {
    const vis = (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.offsetParent !== null);
    const name = vis("intake-name").getBoundingClientRect();
    const phone = vis("intake-phone").getBoundingClientRect();
    const send = vis("intake-send").getBoundingClientRect();
    let prev = vis("intake-send").previousElementSibling;
    while (prev && prev.getBoundingClientRect().height === 0) prev = prev.previousElementSibling;
    return { field: phone.top - name.bottom, main: send.top - prev.getBoundingClientRect().bottom };
  });
  h.expect(gaps.main >= gaps.field + 11, `the main button stands apart: ${gaps.main} above it vs ${gaps.field} between fields`);
};
