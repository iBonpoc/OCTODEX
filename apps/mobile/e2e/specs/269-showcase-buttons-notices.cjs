/**
 * Showcase «Кнопки» and «Уведомления» (#1093 В1), every view:
 * - every kind of button is pressable and the counter says so; a disabled one is not; sizes name their live tokens;
 * - «＋» of the header opens its sheet;
 * - a toast shows; a toast with «Отменить» undoes and goes by itself after about 5 seconds;
 * - «нет сети» shows the badge and the network comes back on the next press;
 * - «Текст в цвете статуса» (DS §3.1 п.2, #1386): each of ok / info / warn / bad has its icon before its words.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const { settle } = require("../settle.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const counter = async () => Number(/(\d+)/.exec(await vis("showcase-btn-counter").innerText())?.[1]);

  await h.go("/settings/design-system/buttons");
  await vis("showcase-buttons").waitFor({ timeout: 5000 });
  h.expect((await counter()) === 0, "nothing pressed yet");
  let n = 0;
  for (const id of ["primary", "secondary", "ghost", "danger", "icon", "size-phone", "size-md", "size-sm", "state-normal"]) {
    await vis(`showcase-btn-${id}`).getByRole("button").first().click();
    n++;
    h.expect((await counter()) === n, `${id} presses (${n})`);
  }
  // a forced click goes to the point, not to the button: centre it first, else at 390 it can sit under the tab bar and the
  // click lands on a tab (#1310: the bigger font moved it there)
  const disabled = vis("showcase-btn-state-disabled").getByRole("button").first();
  await disabled.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await disabled.click({ force: true });
  h.expect((await counter()) === n, "a disabled button does not press");
  await vis("showcase-btn-iconbutton").getByRole("button").first().click();
  h.expect((await counter()) === n + 1, "the round button presses");
  const sizes = await Promise.all(["size-phone", "size-md", "size-sm"].map((id) => vis(`showcase-btn-${id}`).innerText()));
  h.expect(/36/.test(sizes[0]) && /32/.test(sizes[1]) && /28/.test(sizes[2]), `sizes name the live tokens (${sizes.map((x) => x.replace(/\n/g, " ")).join(" | ")})`);
  h.expect(/44/.test(sizes[0]), "…and the 44 tap area");
  // the «＋» of the header: its sheet opens
  await vis("showcase-btn-fab").getByRole("button").first().click();
  await p.locator('[aria-modal="true"]').filter({ has: p.getByTestId("fab-estimate") }).last().waitFor({ timeout: 3000 });
  await pressEscUntilClosed(p);

  // notices
  await h.go("/settings/design-system/notices");
  await vis("showcase-notices").waitFor({ timeout: 5000 });
  for (const tone of ["ok", "info", "warn", "bad"]) {
    h.expect((await p.getByTestId(`showcase-status-${tone}-icon`).locator("visible=true").count()) === 1, `«${tone}» text has its icon`);
    h.expect((await vis(`showcase-status-${tone}`).innerText()).trim().length > 0, `«${tone}» text has its words`);
  }
  await vis("showcase-note-toast").getByRole("button").first().click();
  await p.getByText("Сохранено", { exact: true }).locator("visible=true").first().waitFor({ timeout: 3000 });

  await vis("showcase-note-undo").getByRole("button").first().click();
  const undo = p.getByRole("button", { name: "Отменить", exact: true }).locator("visible=true").first();
  await undo.waitFor({ timeout: 3000 });
  // the toast ignores a tap in its first moments (the second tap of a double tap): press until it takes it and goes
  for (let i = 0; i < 20 && (await undo.count()) > 0; i++) {
    await undo.click({ timeout: 1000 }).catch(() => {});
    await settle(p, { quietMs: 100, maxMs: 500 });
  }
  await p.getByText("Отменено раз: 1", { exact: true }).locator("visible=true").first().waitFor({ timeout: 3000 });

  // the toast with «Отменить» stays about 5 seconds and goes by itself
  await vis("showcase-note-undo").getByRole("button").first().click();
  const t0 = Date.now();
  await p.getByRole("button", { name: "Отменить", exact: true }).locator("visible=true").first().waitFor({ timeout: 3000 });
  await p.getByRole("button", { name: "Отменить", exact: true }).waitFor({ state: "detached", timeout: 9000 });
  const lived = Date.now() - t0;
  h.expect(lived >= 4000 && lived <= 8000, `the «Отменить» toast lives about 5 s (${lived} ms)`);

  // offline
  h.expect((await vis("showcase-note-badge").innerText()).trim() === "", "online: no badge");
  await vis("showcase-note-offline").getByRole("button").first().click();
  await p.waitForFunction(() => /Без сети/.test(document.querySelector('[data-testid="showcase-note-badge"]')?.textContent ?? ""), null, { timeout: 3000 });
  await vis("showcase-note-offline").getByRole("button", { name: "Включить сеть", exact: true }).click();
  await p.waitForFunction(() => (document.querySelector('[data-testid="showcase-note-badge"]')?.textContent ?? "").trim() === "", null, { timeout: 3000 });
};
