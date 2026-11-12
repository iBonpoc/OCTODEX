/**
 * NumberField (DS А6.2), every view — in the showcase (Настройки → Дизайн-система → «Поля ввода»):
 * the sign inside the field; «-100», «abc», «1e5», «12,50» are errors under the field and the value does not move;
 * a decimal comma is the cents («12,5» → 12.50), «1,500» is a thousand five hundred;
 * leaving a right value formats it the US way («2500» → «2,500.00»); an error goes when the value is right.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const input = (id) => vis(id).locator("input").first();
  await h.go("/settings/design-system/fields");
  await vis("showcase-fields").waitFor({ timeout: 5000 });

  h.expect((await input("showcase-num-money").inputValue()) === "1,234.50", "money: shown the US way");
  h.expect(/\$/.test(await vis("showcase-num-money").innerText()), "money: the $ sign is inside the field");
  h.expect(/%/.test(await vis("showcase-num-percent").innerText()), "percent: the % sign is inside the field");
  h.expect(/ft/.test(await vis("showcase-num-qty").innerText()), "qty: the unit «ft» is inside the field");

  for (const bad of ["-100", "abc", "1e5", "12,5000", "12.345"]) {
    await input("showcase-num-money").fill(bad);
    await vis("showcase-num-money-error").waitFor({ timeout: 3000 });
    h.expect(/1,234\.50/.test(await vis("showcase-num-money-value").innerText()), `money «${bad}»: the value did not move to a quiet zero`);
  }
  // a decimal comma (an iPhone without «.») is the cents; «1,500» is a thousand five hundred
  await input("showcase-num-money").fill("12,5");
  await p.getByTestId("showcase-num-money-error").waitFor({ state: "detached", timeout: 3000 });
  await input("showcase-num-money").blur();
  await p.waitForFunction(() => document.querySelector('[data-testid="showcase-num-money"] input')?.value === "12.50", null, { timeout: 3000 });
  await input("showcase-num-money").fill("1,500");
  await input("showcase-num-money").blur();
  await p.waitForFunction(() => document.querySelector('[data-testid="showcase-num-money"] input')?.value === "1,500.00", null, { timeout: 3000 });
  await input("showcase-num-money").fill("2500");
  await p.getByTestId("showcase-num-money-error").waitFor({ state: "detached", timeout: 3000 });
  await input("showcase-num-money").blur();
  await p.waitForFunction(() => document.querySelector('[data-testid="showcase-num-money"] input')?.value === "2,500.00", null, { timeout: 3000 });
  h.expect(/2,500\.00/.test(await vis("showcase-num-money-value").innerText()), "money: the value line follows");

  await input("showcase-num-percent").fill("abc");
  await vis("showcase-num-percent-error").waitFor({ timeout: 3000 });
  await input("showcase-num-percent").fill("8.5");
  await p.getByTestId("showcase-num-percent-error").waitFor({ state: "detached", timeout: 3000 });

  await input("showcase-num-integer").fill("1.5");
  await vis("showcase-num-integer-error").waitFor({ timeout: 3000 });
  await input("showcase-num-qty").fill("-1");
  await vis("showcase-num-qty-error").waitFor({ timeout: 3000 });
  // an empty quantity is an error too (the row it sits in would not close over it)
  await input("showcase-num-qty").fill("");
  await vis("showcase-num-qty-error").waitFor({ timeout: 3000 });
  h.expect(/Укажите количество/.test(await vis("showcase-num-qty-error").innerText()), "empty quantity: «Укажите количество»");
};

