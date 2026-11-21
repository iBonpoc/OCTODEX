/**
 * e2e 503 — #2129 (founder 18.11: «там что-то с текстом почему-то переносится по строкам карточкой»): in «Настройки
 * компании → Люди и телефоны» and «Лицензии» the chips «Основной» / «в документах» sat in the same row as the text and
 * squeezed it — «Alex / Petrov · / Owner», «office@exa / mple.com». Now each is a ListCard (rule 12): the title takes the
 * whole width, the chips their own row.
 * С1 ДАНО человек компании с должностью, почтой, «Основной» и «в документах»; ТОГДА заголовок карточки — одна строка, а
 *    почта не разорвана посередине (одна строка).
 * С2 То же для лицензии.
 * Every view; by testID and the store's data, no UI words.
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.company, KEY, { timeout: 8000 });
  const db = await h.db();
  const person = db.company.contacts[0];
  const lic = db.company.licenses[0];

  // one text node's lines: its height over its line height
  const lines = (sel, text) =>
    p.evaluate(([s, txt]) => {
      const root = [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null);
      if (!root) return -1;
      const el = [...root.querySelectorAll("div, span")].find((e) => e.childElementCount === 0 && e.textContent.trim() === txt && e.offsetParent !== null);
      if (!el) return -2;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
      return Math.round(el.getBoundingClientRect().height / lh);
    }, [sel, text]);

  // С1
  await h.go("/company/contacts");
  await p.locator(`[data-testid="co-contact-${person.id}"]`).locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.shot("contacts");
  const title = `${person.name}${person.title ? ` · ${person.title}` : ""}`;
  const n1 = await lines(`[data-testid="co-contact-${person.id}"]`, title);
  h.expect(n1 === 1, `С1 the person's title is one line: ${n1}`);
  const n2 = await lines(`[data-testid="co-contact-${person.id}"]`, person.email);
  h.expect(n2 === 1, `С1 the email is one line, not broken in the middle: ${n2}`);

  // С2
  await h.go("/company/licenses");
  await p.locator(`[data-testid="co-license-${lic.id}"]`).locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.shot("licenses");
  const n3 = await p.evaluate((s) => {
    const root = [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null);
    const el = root && [...root.querySelectorAll("div, span")].find((e) => e.childElementCount === 0 && /#/.test(e.textContent) && e.offsetParent !== null);
    if (!el) return -2;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3;
    return Math.round(el.getBoundingClientRect().height / lh);
  }, `[data-testid="co-license-${lic.id}"]`);
  h.expect(n3 === 1, `С2 the license's title is one line: ${n3}`);
};
