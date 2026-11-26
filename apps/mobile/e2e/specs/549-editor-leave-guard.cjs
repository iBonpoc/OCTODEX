/**
 * e2e 549 — a «back» that is not the header's «×» does not drop the unsaved edits of an editor (#2853, rule 5, EditorScreen +
 * src/ui/templates/leaveGuard.ts). The browser's back stands here for the iOS back swipe and the Android system «Назад»: all
 * three are a removal of the screen that the editor holds while it is `dirty` (usePreventRemove).
 * С1 ДАНО новый лид без правок КОГДА «назад» браузера ТОГДА экран уходит без вопроса.
 * С2 ДАНО новый лид с набранным именем КОГДА «назад» браузера ТОГДА окно «Выйти без сохранения?», экран и имя на месте;
 *    «Отмена» — остаёмся с именем; снова «назад» и «Выйти» — экран уходит.
 * С3 ДАНО новый клиент с набранным именем КОГДА «назад» браузера ТОГДА то же окно; «Выйти» — к списку клиентов.
 * С4 ДАНО новый лид, всё заполнено КОГДА «Сохранить» ТОГДА лид открыт, окна нет (сохранение — не потеря).
 * By testID (rule 19): `new-lead`, `client-form`, the question's `tpl-confirm-yes` / `tpl-confirm-no`, `lead-save`.
 */
const { sheetGone, waited } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const path = () => new URL(p.url()).pathname;
  const onPath = (re, what) => waited(p.waitForFunction((src) => new RegExp(src).test(location.pathname), re.source, { timeout: 8000 })).then(() => h.expect(re.test(path()), `${what} (${path()})`));
  const askShown = async (what) => {
    await tid("tpl-confirm-yes").waitFor({ state: "visible", timeout: 8000 });
    h.expect(await tid("tpl-confirm-yes").isVisible(), what);
  };
  // the list's «＋»: one kind goes straight to the form; a menu of kinds — its item
  const create = async (list, item, form) => {
    await tid(`${list}-create`).click();
    await waited(p.waitForFunction((args) => [args.item, args.form].some((x) => [...document.querySelectorAll(`[data-testid="${x}"]`)].some((e) => e.getClientRects().length > 0)), { item, form }, { timeout: 8000 }));
    if (await p.getByTestId(item).locator("visible=true").count()) await tid(item).click();
    await tid(form).waitFor({ state: "visible", timeout: 8000 });
  };
  const leadName = () => p.getByTestId("new-lead").getByPlaceholder("Имя", { exact: true }).locator("visible=true").first();

  // С1: nothing typed — the back goes at once, no question
  await h.go("/leads");
  await create("leads", "leads-create-new", "new-lead");
  await onPath(/^\/lead\/new$/, "the new lead is open from the list");
  await p.goBack();
  await onPath(/^\/leads$/, "С1: no edits — the back leaves at once");
  h.expect((await p.getByTestId("tpl-confirm-yes").locator("visible=true").count()) === 0, "С1: no question");

  // С2: a name typed — the back is held and asks; «Отмена» keeps the form and the name
  await create("leads", "leads-create-new", "new-lead");
  await leadName().fill("Guarded Lead");
  await p.goBack();
  await askShown("С2: the back over a typed name asks «Выйти без сохранения?»");
  await h.expectText(/Выйти без сохранения\?/, "С2: the question's words");
  h.expect(/^\/lead\/new$/.test(path()) || (await tid("new-lead").isVisible()), `С2: the form stays under the question (${path()})`);
  await h.shot("lead-back-asks");
  await tid("tpl-confirm-no").click();
  await sheetGone(p);
  h.expect(await tid("new-lead").isVisible(), "С2: «Отмена» — the form is still open");
  h.expect((await leadName().inputValue()) === "Guarded Lead", "С2: «Отмена» — the typed name is kept");
  await p.goBack();
  await askShown("С2: the back asks again");
  await tid("tpl-confirm-yes").click();
  await sheetGone(p);
  await onPath(/^\/leads$/, "С2: «Выйти» — the back goes on to the list");

  // С3: a new client with a name typed — the same question; «Выйти» goes to the clients
  await h.go("/clients");
  await create("clients", "clients-create-new", "client-form");
  await p.getByTestId("client-form").getByPlaceholder("Имя", { exact: true }).locator("visible=true").first().fill("Guarded");
  await p.goBack();
  await askShown("С3: the back over a new client's name asks");
  h.expect(await tid("client-form").isVisible(), "С3: the client form stays under the question");
  await tid("tpl-confirm-yes").click();
  await sheetGone(p);
  await onPath(/^\/clients$/, "С3: «Выйти» — the back goes on to the clients");

  // С4: a filled lead saves and opens — the guard steps aside for the save
  await h.go("/leads");
  await create("leads", "leads-create-new", "new-lead");
  await leadName().fill("Saved Guard");
  await p.getByTestId("new-lead").getByPlaceholder("(555) 555-0100").locator("visible=true").first().fill("8185550199");
  await tid("lead-save").click();
  await onPath(/^\/lead\/(?!new)[^/]+$/, "С4: the save opens the new lead");
  h.expect((await p.getByTestId("tpl-confirm-yes").locator("visible=true").count()) === 0, "С4: the save is not asked");
};
