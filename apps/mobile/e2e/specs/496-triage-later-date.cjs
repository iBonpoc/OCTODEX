/**
 * e2e 496 — #2097 (founder 18.11, audit КЛ-09): «Позже» in «Разбор дел» puts the reason off until a day, and it stays put
 * off (before: it came back at once — only the screen's memory).
 * С1 ДАНО диспетчер в «Разборе дел»; КОГДА «Позже» → «Завтра»; ТОГДА дела нет наверху, тост «Отложено до …», и после
 *    перезагрузки его всё ещё нет.
 * С2 ДАНО «Отменить» в тосте; ТОГДА дело снова наверху.
 * С3 ДАНО дело отложено до дня, который уже настал; ТОГДА оно снова в «Разборе дел».
 * Every view; seeded from a page without the app (h.seed).
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.seed("octo.role.v1", "dispatcher");
  await h.go("/triage");
  const top = () => p.locator('[data-testid^="triage-top-"]').locator("visible=true").first();
  await top().waitFor({ timeout: 8000 });
  const id0 = (await top().getAttribute("data-testid")).slice("triage-top-".length);

  // С1
  await p.getByTestId("triage-later").locator("visible=true").first().getByRole("button").click();
  await p.getByTestId("triage-later-tomorrow").locator("visible=true").first().click();
  await p.getByTestId("toast-text").filter({ hasText: /Отложено до/ }).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId(`triage-top-${id0}`).locator("visible=true").count()) === 0, `С1 «${id0}» is not on top after «Позже»`);
  await p.waitForFunction(([k, id]) => (JSON.parse(localStorage.getItem(k) || "null")?.db?.attentionSnoozes ?? []).some((x) => x.itemId === id && Date.parse(x.until) > Date.now()), [KEY, id0], { timeout: 8000 });
  await h.shot("put-off");

  // С2: «Отменить» brings it back
  await p.getByTestId("toast-undo").locator("visible=true").first().click();
  await p.getByTestId(`triage-top-${id0}`).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(true, "С2 «Отменить»: the reason is back on top");

  // С1 again, then a reload: still put off (kept, not the screen's memory)
  await p.getByTestId("triage-later").locator("visible=true").first().getByRole("button").click();
  await p.getByTestId("triage-later-week").locator("visible=true").first().click();
  await p.waitForFunction(([k, id]) => (JSON.parse(localStorage.getItem(k) || "null")?.db?.attentionSnoozes ?? []).some((x) => x.itemId === id), [KEY, id0], { timeout: 8000 });
  await h.go("/triage");
  await top().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId(`triage-top-${id0}`).locator("visible=true").count()) === 0, "С1 after a reload it is still put off");

  // С3: its day has come — back by itself
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  raw.db.attentionSnoozes = [{ itemId: id0, until: new Date(Date.now() - 60_000).toISOString() }];
  await h.seed(KEY, raw);
  await h.go("/triage");
  await p.getByTestId(`triage-top-${id0}`).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(true, "С3 the day has come: the reason is back");
};
