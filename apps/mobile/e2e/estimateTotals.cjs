/**
 * The estimate's totals rows «Скидка / Налог / Депозит» — one line each, set right in the row (DS §8.7а, #2454): the switch
 * `<row>-mode-<pct|off|fixed>`, the field (`est-tax-rate`, `est-discount-pct|fixed`, `est-deposit-pct|fixed`), the sum `<row>-sum`.
 */
const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();

/** turn a row's switch to `mode` and wait for it to stand chosen */
async function mode(h, row, m) {
  const p = h.page;
  await vis(p, `${row}-mode-${m}`).click();
  await p.waitForFunction(([r, k]) => [...document.querySelectorAll(`[data-testid="${r}-mode-${k}"]`)].some((e) => e.offsetParent !== null && e.getAttribute("aria-checked") === "true"), [row, m], { timeout: 3000 });
}

/** type a value into a row's field (it applies at once) */
async function fill(h, field, value) {
  const input = vis(h.page, field).locator("input");
  await input.fill(String(value));
  await h.page.waitForFunction(([f, v]) => [...document.querySelectorAll(`[data-testid="${f}"] input`)].some((e) => e.offsetParent !== null && e.value === v), [field, String(value)], { timeout: 3000 });
}

/** the sales tax on at `rate` % */
async function setTax(h, rate) {
  await mode(h, "est-tax-row", "pct");
  await fill(h, "est-tax-rate", rate);
}

/** the text of a row's sum («$68.93», «—») */
const sumOf = async (h, row) => (await vis(h.page, `${row}-sum`).innerText()).trim();

module.exports = { mode, fill, setTax, sumOf };
