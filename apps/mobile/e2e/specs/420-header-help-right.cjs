/**
 * e2e 420 — the header of a screen (DS §12.2, Б7), the director, every view, by testID and the «?»'s name:
 * - «?» stands right after the title (#2132, DS Б7; #1648 had put it first on the right) — on lists (Клиенты, Задачи,
 *   Звонки, Сообщения) and on a screen with «‹ back» (новая смета); «＋» · «⋯» stay on the right;
 * - «Задачи», «Звонки», «Сообщения» have their «?» (they had none);
 * - a phone, a list opened from «Ещё»: «‹ Ещё» is a row above the title, the title stands where it stands on a tab
 *   (was: a round button left of the title that pushed it right).
 */
exports.run = async (h) => {
  const p = h.page;
  const phone = h.layout.width < 820;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const help = (name) => p.getByRole("button", { name: `Справка: ${name}`, exact: true }).locator("visible=true").first();
  const heading = () => p.locator('[role="heading"][aria-level="1"]').locator("visible=true").first();

  // a tab list: «?» right after the title, before «＋ Клиент»
  await h.go("/clients");
  await vis("fab-header").waitFor({ timeout: 8000 });
  const tabTitle = await heading().boundingBox();
  let q = await help("Клиенты").boundingBox();
  let plus = await vis("fab-header").boundingBox();
  h.expect(q.x > tabTitle.x + tabTitle.width, "Клиенты: «?» is right of the title, not on it");
  h.expect(q.x + q.width <= plus.x + 1, `Клиенты: «?» first, then «＋» (${Math.round(q.x)} < ${Math.round(plus.x)})`);
  // #2132 (DS Б7): right after the title, not in the group of actions on the right
  h.expect(q.x - (tabTitle.x + tabTitle.width) <= 16, `Клиенты: «?» right after the title (gap ${Math.round(q.x - tabTitle.x - tabTitle.width)})`);

  // the lists from «Ещё»: their own «?», first on the right; on a phone «‹ Ещё» above the title
  for (const [path, name] of [["/tasks", "Задачи"], ["/calls", "Звонки"], ["/messages", "Сообщения"]]) {
    await h.go(path);
    await help(name).waitFor({ timeout: 8000 });
    q = await help(name).boundingBox();
    plus = await vis("fab-header").boundingBox();
    const title = await heading().boundingBox();
    h.expect(q.x > title.x + title.width && q.x - (title.x + title.width) <= 16 && q.x + q.width <= plus.x + 1, `${name}: «?» right after the title, before «＋»`);
    if (phone && path !== "/messages") {
      const back = await vis("back-more").boundingBox();
      h.expect(back.y + back.height <= title.y + 1, `${name}: «‹ Ещё» is a row above the title`);
      h.expect(Math.abs(title.x - tabTitle.x) < 2, `${name}: the title stands where a tab's does (${Math.round(title.x)} vs ${Math.round(tabTitle.x)})`);
    }
  }
  await h.shot("calls-header");

  // a list from «Ещё» with «?» (Работы): «?» first on the right
  await h.go("/jobs");
  await help("Работы").waitFor({ timeout: 8000 });
  q = await help("Работы").boundingBox();
  h.expect(q.x > (await heading().boundingBox()).x + (await heading().boundingBox()).width, "Работы: «?» right of the title");
  await h.shot("jobs-header");

  // a screen with «‹ back» (the estimate): «?» right after the title too (#2132; was the row above the title, on the right)
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await help("Новая смета").waitFor({ timeout: 8000 });
  q = await help("Новая смета").boundingBox();
  const title = await heading().boundingBox();
  h.expect(q.y < title.y + title.height && q.y + q.height > title.y, "смета: «?» is in the title's row");
  h.expect(q.x >= title.x + title.width && q.x - (title.x + title.width) <= 16, "смета: «?» right after the title");
  await h.shot("estimate-header");
};
