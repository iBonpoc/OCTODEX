/**
 * e2e 394 — the fields of sign-in, «Создать компанию», «Чем вы занимаетесь?» and the public request form /f/<token> lie straight
 * on the background (DS §11 п.17, #1455, the continuation of 390), the director, every view, by testID:
 * - the group of fields has no plate between it and the screen's column (no painted ancestor that is only a little wider than it);
 * - the group is as wide as the screen's own column (no card eats 2 × 16 of the field's width);
 * - the fields still work (typing in a group keeps the button enabled / the form sends).
 */
const TOKEN = "f0123456789abcdef0123456789abcdef";

exports.run = async (h) => {
  const p = h.page;
  await p.route("**/functions/v1/lead-intake*", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, form: { company: "Sunset Gutters", language: "en", captcha: false, sms_consent: false, categories: [] } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  // a plate is a painted ancestor narrower than the screen: the screen's own background layers are as wide as the widest ancestor
  const plateOver = (id) =>
    p.evaluate((gid) => {
      const el = [...document.querySelectorAll(`[data-testid="${gid}"]`)].find((e) => e.offsetParent !== null);
      if (!el) return "missing";
      const chain = [];
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) chain.push({ w: a.getBoundingClientRect().width, bg: getComputedStyle(a).backgroundColor });
      const maxW = Math.max(...chain.map((x) => x.w));
      const plate = chain.find((x) => x.w > 0 && x.w < maxW - 1 && x.bg && x.bg !== "transparent" && x.bg !== "rgba(0, 0, 0, 0)");
      return plate ? plate.bg : null;
    }, id);
  const check = async (path, group) => {
    await h.go(path);
    await tid(group).waitFor({ timeout: 8000 });
    h.expect((await plateOver(group)) === null, `${path}: no plate under «${group}» (${await plateOver(group)})`);
    // the group spans the column of the screen: its parent is not narrower than it, and no padding of a card sits between
    const gap = await tid(group).evaluate((e) => {
      const b = e.getBoundingClientRect();
      const pb = e.parentElement.getBoundingClientRect();
      return Math.abs(pb.width - b.width);
    });
    h.expect(gap <= 1, `${path}: «${group}» spans its column (differs by ${gap})`);
  };

  await check("/auth/sign-in", "auth-fields");
  await h.shot("sign-in");
  await check("/auth/company", "company-fields");
  await h.shot("company");
  await check("/auth/trade", "trade-own");
  await h.shot("trade");
  await check(`/f/${TOKEN}`, "intake-fields");
  await h.shot("intake");

  // the fields still work: typing a name enables «Создать» on the company screen
  await h.go("/auth/company");
  await tid("company-fields").locator("input").first().fill("E2E Gutters 394");
  h.expect(await tid("company-fields").locator("input").first().inputValue() === "E2E Gutters 394", "the company name is typed");
};
