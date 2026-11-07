/**
 * «Ещё» as grouped rows (founder 07.11 «очень некрасивое меню», docs/specs/25-more-menu.md), every view:
 * - rows in one column, 44 high, groups Работа · Документы · Деньги · Компания (director) and the rest without a title;
 * - no tiles, no «Все разделы приложения»;
 * - counters: «Счета · Просрочено: N» is the only status (bad), the others are quiet text; zero → nothing;
 * - «Онлайн · всё сохранено» is quiet (no green); no yellow on the screen besides the shell «＋»;
 * - 820/1280: one column not wider than component.menuListMax (560);
 * - the tech: no «Компания», no money rows, no counters of sections he does not have.
 */
const { dueKey, todayKey } = require("../companyTime.cjs");
const { expectOneAccent } = require("../accent.cjs");

const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  const row = (id) => p.locator(`[data-testid="more-${id}"]:visible`);
  await h.go("/today");
  await setRole(h, "director");
  await h.go("/more");
  const db = await h.db();

  h.expect(!/Все разделы приложения/.test(await h.text()), "no subtitle «Все разделы приложения»");

  // groups in order, «Компания» holds Команда and Настройки компании
  const screenText = await p.locator('[data-testid="more-screen"]:visible').innerText();
  const pos = ["Работа", "Документы", "Деньги", "Компания"].map((g) => screenText.indexOf(g));
  h.expect(pos.every((x) => x >= 0) && pos.every((x, i) => i === 0 || x > pos[i - 1]), `groups in order (${pos.join(", ")})`);
  for (const id of ["team", "company"]) h.expect((await p.locator(`[data-testid="more-group-company"] [data-testid="more-${id}"]`).count()) === 1, `«${id}» in «Компания»`);
  for (const id of ["settings", "help"]) h.expect((await p.locator(`[data-testid="more-group-bottom"] [data-testid="more-${id}"]`).count()) === 1, `«${id}» at the bottom`);

  // rows: one column, 44 high, the name is exactly the word
  const ids = ["leads", "jobs", "calls", "tasks", "estimates", "invoices", "catalog", "payments", "reports", "money", "team", "company", "settings", "help"];
  const boxes = [];
  for (const id of ids) {
    const b = await row(id).boundingBox();
    h.expect(b && b.height >= 43.5, `row «${id}» 44 high (${b && b.height})`);
    boxes.push(b);
  }
  h.expect(boxes.every((b) => Math.abs(b.x - boxes[0].x) <= 1 && Math.abs(b.width - boxes[0].width) <= 1), "rows in one column (no tiles)");
  h.expect((await p.locator('[data-testid="more-screen"]:visible').getByRole("button", { name: "Настройки компании", exact: true }).count()) === 1, "a row's name is exactly its word (the side menu on 820/1280 has its own)");
  if (wide) {
    const sb = await p.locator('[data-testid="more-screen"]:visible').boundingBox();
    h.expect(sb && sb.width <= 560.5, `one column not wider than 560 on ${h.layout.width} (${sb && sb.width})`);
  }

  // counters: overdue invoices — a bad chip with the word; nothing on a row without work
  const today = todayKey();
  const overdue = db.invoices.filter((i) => i.paidCents < i.totalCents && dueKey(i.dueDate) < today).length;
  h.expect(overdue > 0, "the demo has an overdue invoice");
  const inv = await row("invoices").innerText();
  h.expect(inv.includes(`Просрочено: ${overdue}`), `«Счета» counter «Просрочено: ${overdue}» (${inv})`);
  const chipColor = await row("invoices").locator('[aria-label^="Просрочено"]').evaluate((e) => getComputedStyle(e.querySelector("div[dir], div") ?? e).color).catch(() => "");
  h.expect(!!chipColor, "the overdue counter is a status chip (icon + word)");
  h.expect(!/\d/.test(await row("catalog").innerText()), "no counter on «Каталог»");

  // quiet «all saved»: same grey as the profile's role line, no green fill
  const quiet = await p.evaluate(() => {
    const s = document.querySelector('[data-testid="more-sync"]');
    const filled = s && [...s.querySelectorAll("*")].some((e) => { const bg = getComputedStyle(e).backgroundColor; return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent"; });
    return { text: s?.innerText ?? "", filled };
  });
  h.expect(/Онлайн · всё сохранено/.test(quiet.text) && !quiet.filled, `«Онлайн · всё сохранено» without a colour fill (${JSON.stringify(quiet)})`);
  await expectOneAccent(h, "«Ещё»");
  await h.shot("director");

  // a row opens its section
  await row("tasks").click();
  await p.waitForTimeout(500);
  h.expect(new URL(p.url()).pathname === "/tasks", `row → /tasks (${p.url()})`);

  // the technician: no «Компания», no money rows, no invoice counter
  await setRole(h, "tech");
  await h.go("/more");
  h.expect((await p.locator('[data-testid="more-group-company"]').count()) === 0, "tech: no «Компания»");
  for (const id of ["invoices", "payments", "reports", "money", "team", "company", "leads"]) h.expect((await row(id).count()) === 0, `tech: no row «${id}»`);
  h.expect(!/Просрочено/.test(await h.text()), "tech: no overdue counter");
  await h.shot("tech");
};
