/**
 * e2e 103 — lead → estimate → client signs → company signs → invoice → payment, against a real Supabase
 * (docs/specs/21 §4; story map S3 → S5 → S6 → S7 → S8 → S8b → S9 → S10; S0: the numbers are the server's).
 * The app works as on the phone (its queue → ops.ts → PostgREST); after every step the SERVER is checked with the
 * service role, not the app's own copy:
 * - the lead row; the estimate with a server number EST-…, status sent, a client link;
 * - the client page /p/<token> in a fresh browser (anon → portal_estimate / portal_accept) → awaiting the company;
 * - the company signs → approved, a job; «Выставить остаток» → an invoice INV-…; «Принять оплату» → a payment with a
 *   receipt RCT-…, and the invoice's paid_cents is the trigger's sum of its payments.
 * Prices are test prices (rule 9).
 */
const path = require("node:path");
const { signIn, waitRows } = require("../signIn.cjs");
const { helpers } = require("../../h.cjs");

const LINE = "Nightly test line (тестовые)";
const PRICE = "1850"; // test price

exports.run = async (h, { seed, admin, browser, BASE }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const A = a1.companyId;
  await signIn(h, a1);

  // S1: a lead typed in the app
  const phone = `626555${String(Date.now()).slice(-4)}`;
  await h.go("/lead/new");
  await p.getByPlaceholder("(555) 555-0100").last().pressSequentially(phone);
  await p.getByPlaceholder("Имя", { exact: true }).last().fill("Nightly Lead 103");
  await p.getByPlaceholder("Улица, дом, офис").last().fill("103 Cloud St");
  await p.getByPlaceholder("Pasadena").last().fill("Glendale");
  await h.click("Сохранить лид");
  await p.waitForTimeout(700);
  const leadId = p.url().split("/lead/")[1];
  h.expect(!!leadId, `the lead card opened (${p.url()})`);
  const [lead] = await waitRows(admin, `leads?id=eq.${leadId}&select=id,company_id,status,contact_name`, (r) => r.length === 1, "the lead");
  h.expect(lead.company_id === A && lead.contact_name === "Nightly Lead 103", `S1: the lead is on the server in company A (${JSON.stringify(lead)})`);

  // S5 → S6: an estimate from the lead, one line, sent
  await h.clickText("Сметы");
  await h.click("Смета");
  await p.getByRole("button", { name: "Добавить позицию" }).first().click();
  await p.waitForTimeout(300);
  await h.sheet().getByPlaceholder(/Начните писать/).fill(LINE);
  await h.sheet().getByText(/Своя позиция:/).click();
  await p.waitForTimeout(250);
  await h.sheet().locator('input[inputmode="decimal"]').nth(1).fill(PRICE);
  await h.sheet().getByRole("button", { name: "Готово" }).click();
  await p.waitForTimeout(250);
  await p.getByRole("button", { name: "Сохранить и отправить" }).click();
  await p.waitForTimeout(700);
  await p.getByRole("button", { name: "Копировать ссылку" }).click();
  await p.waitForTimeout(400);
  const [est] = await waitRows(
    admin,
    `estimates?company_id=eq.${A}&lead_id=eq.${leadId}&select=id,number,status,public_token,customer_id`,
    (r) => r.length === 1 && r[0].status === "sent" && !!r[0].public_token,
    "the sent estimate",
  );
  h.expect(/^EST-\d{4,}$/.test(est.number ?? ""), `S0: the server numbered the estimate (${est.number})`);
  const [l2] = await waitRows(admin, `leads?id=eq.${leadId}&select=status,customer_id`, (r) => r[0]?.status === "estimate_sent", "lead → estimate sent");
  h.expect(l2.customer_id === est.customer_id, "S3: the lead's client is the estimate's client");
  await h.shot("sent");

  // S7 → S8: the client opens the link in their own browser (no sign-in) and signs
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
  const cp = await ctx.newPage();
  const clientErrors = [];
  cp.on("pageerror", (e) => clientErrors.push(e.message));
  await cp.goto(`${BASE}/p/${est.public_token}`);
  await cp.waitForTimeout(1500);
  const ch = helpers(cp, BASE, path.join(__dirname, "../../out"), "cloud-103-client");
  const body = async () => (await cp.locator("body").innerText()).split("\n").join(" | ");
  for (let i = 0; i < 25 && !(await body()).includes(LINE); i++) await cp.waitForTimeout(200);
  h.expect((await body()).includes(LINE), `S7: the client page shows the line from the server\n${(await body()).slice(0, 300)}`);
  await ch.sign("Nightly Client");
  await waitRows(admin, `estimates?id=eq.${est.id}&select=status`, (r) => r[0]?.status === "awaiting_countersign", "the client's signature (awaiting the company)");
  h.expect(!clientErrors.length, `no errors on the client page: ${clientErrors.join("; ")}`);
  await ctx.close();

  // S8b: the company signs on the estimate screen
  await h.go(`/estimate/${est.id}`);
  const pad = p.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await p.mouse.move(bb.x + 30, bb.y + 90);
  await p.mouse.down();
  for (let i = 0; i < 20; i++) await p.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await p.mouse.up();
  await p.getByRole("button", { name: "Подписать договор" }).last().click();
  await p.waitForTimeout(700);
  await waitRows(admin, `estimates?id=eq.${est.id}&select=status`, (r) => r[0]?.status === "approved", "the approved estimate");
  const [job] = await waitRows(admin, `jobs?company_id=eq.${A}&estimate_id=eq.${est.id}&select=id,number,status`, (r) => r.length === 1, "the job of the approved estimate");
  h.expect(/^JOB-\d{4,}$/.test(job.number ?? ""), `S8: a job with a server number (${job.number})`);

  // S9: the balance is invoiced
  await h.go(`/estimate/${est.id}`);
  await p.getByRole("button", { name: /Выставить остаток/ }).click();
  await p.waitForTimeout(600);
  const invs = await waitRows(admin, `invoices?company_id=eq.${A}&job_id=eq.${job.id}&select=id,number,total_cents,paid_cents,kind`, (r) => r.some((i) => i.total_cents > 0 && i.paid_cents === 0 && i.kind !== "deposit"), "the balance invoice");
  const inv = invs.find((i) => i.kind !== "deposit" && i.paid_cents === 0);
  h.expect(/^INV-\d{4,}$/.test(inv.number ?? ""), `S0: the server numbered the invoice (${inv.number})`);

  // S10: a payment on it
  await h.go(`/invoice/${inv.id}`);
  await p.getByRole("button", { name: "Принять оплату" }).click();
  await p.waitForTimeout(300);
  await h.sheet().locator('input[inputmode="decimal"]').fill(String(inv.total_cents / 100));
  await h.sheet().getByRole("radio", { name: "Наличные" }).click();
  await h.sheet().getByRole("button", { name: /Записать/ }).click();
  await p.waitForTimeout(800);
  const [pay] = await waitRows(admin, `payments?company_id=eq.${A}&invoice_id=eq.${inv.id}&select=id,amount_cents,method,receipt_number,idempotency_key,status`, (r) => r.length === 1, "the payment");
  h.expect(pay.amount_cents === inv.total_cents && pay.method === "cash", `the payment: ${JSON.stringify(pay)}`);
  h.expect(/^RCT-\d{4,}$/.test(pay.receipt_number ?? ""), `S0: the server numbered the receipt (${pay.receipt_number})`);
  const [paid] = await waitRows(admin, `invoices?id=eq.${inv.id}&select=paid_cents,total_cents`, (r) => r[0]?.paid_cents === r[0]?.total_cents, "the invoice paid by the trigger");
  h.expect(paid.paid_cents === inv.total_cents, "the invoice's paid_cents = its payments (the trigger)");
  await h.expectText(/RCT-\d+/, "the app shows the server's receipt number");
  await h.shot("paid");
};
