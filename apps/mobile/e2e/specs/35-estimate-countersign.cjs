/**
 * E2b-1 (docs/specs/07 «E2b — экраны подписи»): after the client signs, the company signs, declines or changes it;
 * the client page shows each state in the client's language (English here, the app is Russian); revoke; expired link.
 */
const TOKEN = "demo0handyman0estimate0000000001";

/** copies of the demo estimate e6 with their own id, token and state (the app has one demo estimate with a link) */
async function cloneEstimate(h, id, patch) {
  await h.page.evaluate(
    ({ id, patch }) => {
      const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
      const e6 = raw.db.estimates.find((e) => e.id === "e6");
      raw.db.estimates.push({ ...e6, id, number: `EST-${id}`, token: `demo0${id}0000000000000000000000`.slice(0, 32), status: "sent", ...patch });
      localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    },
    { id, patch },
  );
}
const tokenOf = (id) => `demo0${id}0000000000000000000000`.slice(0, 32);

async function countersign(h, estimateId) {
  await h.go(`/estimate/${estimateId}`);
  const pad = h.page.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded(); await h.page.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await h.page.mouse.move(bb.x + 30, bb.y + 90); await h.page.mouse.down();
  for (let i = 0; i < 20; i++) await h.page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await h.page.mouse.up();
  await h.page.getByRole("button", { name: "Подписать договор" }).last().click(); await h.page.waitForTimeout(700);
}

exports.run = async (h) => {
  await h.go("/today");
  await cloneEstimate(h, "e35d", {});
  await cloneEstimate(h, "e35o", {});
  await cloneEstimate(h, "e35r", {});
  await cloneEstimate(h, "e35x", { validUntil: "2020-01-01" });

  // 1. client signs → the company sees the summary, signs → the client page: signed by both + the signed PDF
  await h.go(`/p/${TOKEN}`);
  await h.sign("Linda Alvarez");
  await h.expectText(/will sign the contract; your copy will appear here/, "client page: awaiting the company (client's language)");
  await h.go("/estimate/e6");
  await h.expectText(/Ждёт вашей подписи/, "the app: awaiting your signature");
  await h.expectText(/итог \$772\.36/, "summary: the total the client signed");
  await h.expectText(/Не подписывать — изменить/, "director sees «change it»");
  await countersign(h, "e6");
  await h.go(`/p/${TOKEN}`);
  await h.expectText(/Contract signed by both sides/, "client page: signed by both");
  await h.expectText(/Download the signed PDF/, "client page: download the signed PDF");

  // 2. client signs → the company declines with a reason → the client page says declined; the lead is untouched
  await h.go(`/p/${tokenOf("e35d")}`);
  await h.sign("Linda Alvarez");
  await h.go("/estimate/e35d");
  await h.page.getByRole("button", { name: "Отказать" }).last().click(); await h.page.waitForTimeout(350);
  await h.sheet().getByPlaceholder(/Причина/).fill("Мы не успеем в этом месяце");
  await h.sheet().getByRole("button", { name: "Отказать" }).click(); await h.page.waitForTimeout(600);
  await h.expectText(/Отклонена компанией/, "declined by the company");
  await h.expectText(/Причина: Мы не успеем в этом месяце/, "the reason, for the team");
  let db = await h.db();
  h.expect(db.estimates.find((e) => e.id === "e35d").status === "declined", "status declined");
  h.expect(!db.jobs.some((j) => j.estimateId === "e35d"), "no job after a decline");
  await h.go(`/p/${tokenOf("e35d")}`);
  await h.expectText(/declined this estimate/, "client page: declined (client's language)");
  const page = await h.text();
  h.expect(!/Мы не успеем/.test(page), "the client never sees the reason");

  // 3. client signs → «don't sign — change it» → a draft again, the editor opens
  await h.go(`/p/${tokenOf("e35o")}`);
  await h.sign("Linda Alvarez");
  await h.go("/estimate/e35o");
  await h.page.getByRole("button", { name: "Не подписывать — изменить" }).last().click(); await h.page.waitForTimeout(350);
  await h.sheet().getByRole("button", { name: "Не подписывать — изменить" }).click(); await h.page.waitForTimeout(800);
  db = await h.db();
  h.expect(db.estimates.find((e) => e.id === "e35o").status === "draft", "change it: back to draft");
  h.expect(!db.estimates.find((e) => e.id === "e35o").approval, "the client signs the new version again");

  // 4. revoke an unsigned link → the old link does not open
  await h.go("/estimate/e35r");
  await h.page.getByRole("button", { name: "Отозвать ссылку" }).last().click(); await h.page.waitForTimeout(600);
  await h.go(`/p/${tokenOf("e35r")}`);
  await h.expectText(/Ссылка больше не действует/, "revoked link: not valid");
  await h.go("/estimate/e6");
  h.expect(!(await h.text()).includes("Отозвать ссылку"), "a signed estimate has no «revoke»");

  // 5. past valid until → only who to call
  await h.go(`/p/${tokenOf("e35x")}`);
  await h.expectText(/This estimate has expired — contact/, "expired: who to call (client's language)");
  h.expect(!/Linda Alvarez/.test(await h.text()), "expired: nothing of the client");
};
