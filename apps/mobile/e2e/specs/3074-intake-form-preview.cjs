/**
 * #3074 «Открыть форму ›» of «Заявки с сайта» opens the company's request page /f/<token>?preview=1 inside the app: the
 * contractor sees it as the homeowner does, a note on top in the app's language says it is a preview, and «Отправить»
 * (as the homeowner's) only says so — nothing reaches the server; the preview always has «Назад». The same page without ?preview sends as before (spec 178).
 * The row's rule (on → open, off → said, nothing opens; «Поделиться» off → a warning) is unit test/intakeSettings.test.ts:
 * the settings screen itself is cloud-only (spec 179 checks the demo's note). The edge function is put in by page.route.
 */
const TOKEN = "f0123456789abcdef0123456789abcd74";
exports.run = async (h) => {
  const p = h.page;
  const posts = [];
  await p.route("**/functions/v1/lead-intake*", async (route) => {
    const r = route.request();
    if (r.method() === "GET") {
      const form = { company: "Sunset Gutters", language: "en", captcha: false, sms_consent: false, categories: [] };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, form }) });
    }
    if (r.method() === "POST") {
      posts.push(r.postData());
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    }
    return route.fulfill({ status: 204, body: "" });
  });
  const input = (id) => p.locator(`[data-testid="${id}"] input, [data-testid="${id}"] textarea`).locator("visible=true").first();
  const send = () => p.locator('[data-testid="intake-send"] [role="button"], [data-testid="intake-send"] button').locator("visible=true").first();

  await h.go(`/f/${TOKEN}?preview=1`);
  await h.expectText(/Sunset Gutters/, "the company's form");
  h.expect((await p.getByTestId("hdr-back").locator("visible=true").count()) > 0 || (await p.getByRole("button", { name: /Назад|Back/ }).locator("visible=true").count()) > 0, "a way back even when opened first");
  const note = p.getByTestId("intake-preview").locator("visible=true").first();
  await note.waitFor();
  h.expect(/Предпросмотр/.test(await note.innerText()), "the preview note, in the app's language (the contractor's), not the form's English");
  await h.expectText(/Tell Sunset Gutters what you need/, "the form itself in the homeowner's language");
  await h.shot("empty");
  await input("intake-name").fill("Test Person");
  await input("intake-phone").fill("5125550123");
  // the button looks as the homeowner's (filled → on); a tap says it is a preview and sends nothing
  await send().click();
  await h.expectText(/Отсюда заявка не уйдёт/, "a tap in the preview says why nothing goes");
  await h.shot(1);
  h.expect(posts.length === 0, "nothing was sent from the preview");
  h.expect((await p.getByTestId("intake-sent").count()) === 0, "no «Request sent»");

  // the same page without ?preview: no note (the homeowner's page is as before)
  await h.go(`/f/${TOKEN}`);
  await h.expectText(/Tell Sunset Gutters what you need/, "the homeowner's page");
  h.expect((await p.getByTestId("intake-preview").count()) === 0, "no preview note for the homeowner");
};
