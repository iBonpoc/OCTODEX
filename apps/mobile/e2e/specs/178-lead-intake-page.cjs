/**
 * Step 16, PR 2 (docs/specs/34-lead-intake.md §3, story map S1): the request page of a company /f/<token>, opened by a
 * homeowner without the app. The edge function is put in by the browser (page.route, no network):
 * GET → the company's form; POST → always {ok: true}. The page speaks the client's language (the browser's, ?lang=, the
 * chips), sends only what the form has (the hidden field empty, the opening time, a nonce kept for a retry), shows the
 * SMS box only when the company turned it on, and says «Request sent». An unknown token: «not available».
 */
const TOKEN = "f0123456789abcdef0123456789abcdef";
exports.run = async (h) => {
  const p = h.page;
  const posts = [];
  let failNext = false;
  let smsConsent = true;
  let captcha = false;
  await p.route("**/functions/v1/lead-intake*", async (route) => {
    const r = route.request();
    if (r.method() === "GET") {
      const t = new URL(r.url()).searchParams.get("t");
      const form = t === TOKEN ? { company: "Sunset Gutters", language: "en", captcha, sms_consent: smsConsent, categories: [
        { id: "0b000000-0000-4000-8000-000000000001", key: "gutters" }, { id: "0b000000-0000-4000-8000-000000000002", name: "Window cleaning" }] } : null;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, form }) });
    }
    if (r.method() === "POST") {
      posts.push(JSON.parse(r.postData() || "{}"));
      // a busy answer (200 + ok:false here: a 5xx would be a console error of the run; the page treats both the same)
      if (failNext) { failNext = false; return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":false,"code":"busy"}' }); }
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    }
    return route.fulfill({ status: 204, body: "" });
  });
  const input = (id) => p.locator(`[data-testid="${id}"] input, [data-testid="${id}"] textarea`).first();
  const send = () => p.locator('[data-testid="intake-send"] [role="button"], [data-testid="intake-send"] button').first();

  // an unknown token: the same «not available» whatever the reason
  await h.go("/f/f00000000000000000000000000000000");
  await h.expectText(/This request form is not available/, "an unknown form, in the browser's language (en-US), not the app's Russian");

  // the company's form, in English (the browser), with its kinds of work and the SMS box
  await h.go(`/f/${TOKEN}?utm_source=gbp&utm_campaign=fall`);
  await h.expectText(/Sunset Gutters/, "the company's name");
  await h.expectText(/Tell Sunset Gutters what you need/, "in English");
  h.expect(await p.locator('[data-testid="intake-consent"]').count() === 1, "the SMS box is there when the company turned it on");
  await h.expectText(/Gutters/, "a preset kind of work in the client's language");
  await h.expectText(/Window cleaning/, "the company's own kind of work");
  h.expect(await send().getAttribute("aria-disabled") === "true", "no phone and no email: «Send request» is off");
  await h.expectText(/Leave a phone or an email/, "the page says what is missing");
  await h.shot("form-en");

  // Spanish by the chip: the whole page follows
  await h.clickText("Español");
  await h.expectText(/Cuéntele a Sunset Gutters lo que necesita/, "the chips change the page's language");
  h.expect(await p.getByRole("switch", { name: /Acepto recibir mensajes de texto de Sunset Gutters/ }).count() === 1, "the SMS consent text in Spanish");

  await input("intake-name").fill("Ana López");
  await input("intake-phone").fill("6265550113");
  await input("intake-message").fill("Limpiar canaletas, 2 pisos");
  await h.clickText("Window cleaning");
  await p.getByRole("switch", { name: /Acepto recibir/ }).click();
  failNext = true; // the first send meets a busy server
  await send().click();
  await h.expectText(/No se pudo enviar/, "a failed send says so and keeps the form");
  await send().click();
  await h.expectText(/Solicitud enviada/, "sent");
  await h.expectText(/Sunset Gutters recibió su solicitud/, "who got it");
  h.expect(await p.locator('[data-testid="intake-sent"]').count() === 1, "the sent state");
  h.expect(await p.getByText("Лиды", { exact: true }).count() === 0, "no app menu on a homeowner's page (no side nav, no tab bar)");
  await h.shot("sent-es");

  h.expect(posts.length === 2, `two sends (one failed): ${posts.length}`);
  const [a, b] = posts;
  h.expect(a.nonce && a.nonce === b.nonce, "a retry keeps the same nonce: the server takes it as one request");
  h.expect(b.t === TOKEN && b.name === "Ana López" && b.phone.replace(/\D/g, "") === "6265550113" && b.message === "Limpiar canaletas, 2 pisos", "the fields");
  h.expect(b.language === "es", "the client's language goes with the request");
  h.expect(b.consent === true, "the consent the person ticked");
  h.expect(b.website === "", "the hidden field is empty");
  h.expect(b.category_id === "0b000000-0000-4000-8000-000000000002", "the kind of work chosen");
  h.expect(typeof b.filled_ms === "number" && b.filled_ms > 0, "how long the page was open, by the page's own clock (the server checks it)");
  h.expect(!("opened_at" in b), "no device time is sent");
  h.expect(b.utm && b.utm.utm_source === "gbp" && b.utm.utm_campaign === "fall", "where the visitor came from");
  h.expect(!("cost_cents" in b) && !("provider" in b) && !("event_key" in b), "a page sends no price, provider or event key");

  // a double tap sends once
  posts.length = 0;
  await h.go(`/f/${TOKEN}`);
  await input("intake-email").fill("ann@example.com");
  await send().dblclick();
  await h.expectText(/Request sent/, "sent after a double tap");
  h.expect(posts.length === 1, `a double tap sends once: ${posts.length}`);

  // a form that requires a captcha: no widget here yet (В3) — «not available», never a lost request
  captcha = true;
  await h.go(`/f/${TOKEN}`);
  await h.expectText(/This request form is not available/, "a captcha form is not offered without its widget");
  captcha = false;

  // a company without the SMS box; ?lang=ru
  smsConsent = false;
  await h.go(`/f/${TOKEN}?lang=ru`);
  await h.expectText(/Напишите Sunset Gutters, что нужно сделать/, "?lang= sets the language");
  h.expect(await p.locator('[data-testid="intake-consent"]').count() === 0, "no SMS box when the company has it off");
  await h.shot("form-ru");
};
