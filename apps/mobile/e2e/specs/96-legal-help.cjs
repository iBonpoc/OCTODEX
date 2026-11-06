/**
 * Wave 7а-1 — согласие, документы, «Помощь и поддержка» (docs/specs/19 §5; legal/01 §3.5; App Store 1.5). Demo mode;
 * the server side (no company / no team without the consent, the journal) is db T49.
 * - the sign-in screen: an EMPTY tick «Я принимаю Условия использования и Политику конфиденциальности»; without it
 *   «Получить код» and «Создать аккаунт» are off even with a good email; the tick turns them on; untick — off again;
 * - the underlined links open the drafts /legal/terms and /legal/privacy (a tap on a link does not tick the box);
 * - a draft: «Черновик», «Редакция от …» (US date), sections, «the English text governs» (not in English); an unknown
 *   document — «Такого документа нет»;
 * - «Ещё» → «Помощь и поддержка»: the support email, «Написать в поддержку», «Сообщить о проблеме», no legal advice;
 * - «Мои настройки» → «О приложении»: both documents with their editions and help;
 * - the demo is never sent to the consent gate (offline / no session — work is not blocked).
 */
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  const btn = (name) => p.getByRole("button", { name, exact: true }).locator("visible=true").last();

  // the sign-in screen: the tick comes first, the buttons wait for it
  await h.go("/auth/sign-in");
  const tick = vis("legal-agree");
  await tick.waitFor({ timeout: 4000 });
  h.expect((await tick.getAttribute("aria-checked")) === "false", "the tick starts empty");
  await h.expectText(/Я принимаю.*Условия использования.*и.*Политика конфиденциальности/s, "the words say that ticking is agreeing");
  await p.getByPlaceholder("Email").locator("visible=true").last().fill("owner@example.com");
  h.expect(await btn("Получить код").isDisabled(), "a good email, no tick: «Получить код» is off");
  await tick.click();
  await p.waitForTimeout(200);
  h.expect((await tick.getAttribute("aria-checked")) === "true", "ticked");
  h.expect(!(await btn("Получить код").isDisabled()), "ticked: «Получить код» is on");
  await h.shot("sign-in-ticked");
  await tick.click();
  await p.waitForTimeout(200);
  h.expect(await btn("Получить код").isDisabled(), "untick: off again");
  // the sign-up form too
  await btn("Войти с паролем").click();
  await btn("Нет аккаунта — создать").click();
  await p.getByPlaceholder("Пароль").locator("visible=true").last().fill("secret123");
  await p.getByPlaceholder("Ваше имя").locator("visible=true").last().fill("Olga Owner");
  h.expect(await btn("Создать аккаунт").isDisabled(), "sign-up without the tick is off");
  await vis("legal-agree").click();
  await p.waitForTimeout(200);
  h.expect(!(await btn("Создать аккаунт").isDisabled()), "sign-up with the tick is on");

  // the links: visible, underlined, open the documents, do not tick
  await h.go("/auth/sign-in");
  await vis("legal-agree").waitFor({ timeout: 4000 });
  const under = await vis("legal-agree-terms").evaluate((el) => [el, ...el.querySelectorAll("*")].map((x) => getComputedStyle(x).textDecorationLine).join(","));
  h.expect(/underline/.test(under), `the link is underlined (${under})`);
  await vis("legal-agree-terms").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/legal/terms", `the Terms link opens /legal/terms (${path(h)})`);
  await vis("legal-terms").waitFor({ timeout: 4000 });
  const terms = await vis("legal-terms").innerText();
  for (const s of ["Черновик", "Редакция от", "Кто принимает", "Что такое OCTODEX", "Пределы ответственности", "Common Paper"])
    h.expect(terms.includes(s), `the Terms draft: «${s}»`);
  h.expect(/Обязательным считается текст на английском/.test(terms), "a translation says the English text governs");
  h.expect(!/compliant|guarantee|гарантир/i.test(terms), "no compliance promise or guarantee");
  await h.shot("terms");
  await p.goBack();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/auth/sign-in", "back to sign-in");
  h.expect((await vis("legal-agree").getAttribute("aria-checked")) === "false", "opening a link did not tick the box");
  await vis("legal-agree-privacy").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/legal/privacy", `the Privacy link opens /legal/privacy (${path(h)})`);
  const privacy = await vis("legal-privacy").innerText();
  for (const s of ["Черновик", "Что мы собираем", "Без слежки", "Mobile information will not be shared"]) h.expect(privacy.includes(s), `the Privacy draft: «${s}»`);
  await h.go("/legal/nothing");
  await h.expectText(/Такого документа нет/, "an unknown document");

  // «Ещё» → «Помощь и поддержка»
  await h.go("/more");
  await vis("more-help").waitFor({ timeout: 4000 });
  await vis("more-help").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/help", `the tile opens /help (${path(h)})`);
  const help = await vis("help-screen").innerText();
  for (const s of ["support@octodex.example", "Написать в поддержку", "Сообщить о проблеме", "Юридических и налоговых советов мы не даём", "Условия использования", "Политика конфиденциальности", "OCTODEX v"])
    h.expect(help.includes(s), `help: «${s}»`);
  await h.shot("help");

  // «Мои настройки» → «О приложении»
  await h.go("/settings");
  const about = vis("settings-about");
  await about.scrollIntoViewIfNeeded();
  const at = await about.innerText();
  for (const s of ["Условия использования", "Политика конфиденциальности", "Помощь и поддержка", "Редакция от"]) h.expect(at.includes(s), `about: «${s}»`);
  await about.getByRole("button", { name: "Помощь и поддержка" }).click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/help", "about → help");

  // English: the documents without the translation note, the tick in English
  await p.evaluate(() => localStorage.setItem("octo.lang.v1", JSON.stringify("en")));
  await h.go("/legal/terms");
  const en = await vis("legal-terms").innerText();
  h.expect(en.includes("Edition of November 6, 2026") && en.includes("Draft"), `English edition date in US format: ${en.slice(0, 80)}`);
  h.expect(!en.includes("The English text governs"), "no translation note in English");
  await h.go("/auth/sign-in");
  await h.expectText(/I agree to the.*Terms of Service.*and the.*Privacy Policy/s, "the tick in English");
  await p.evaluate(() => localStorage.setItem("octo.lang.v1", JSON.stringify("ru")));

  // the demo is never sent to the consent gate
  await h.go("/today");
  await p.waitForTimeout(800);
  h.expect(path(h) === "/today", `demo: no consent gate (${path(h)})`);
};
