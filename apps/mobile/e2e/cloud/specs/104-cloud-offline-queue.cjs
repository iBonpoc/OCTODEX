/**
 * e2e 104 — offline → the queue → sent, against a real Supabase (rule 6; docs/specs/21 §4).
 * The browser really loses the network (context.setOffline): the app cannot reach the server at all.
 * - a lead typed while offline shows at once on the phone; the server does not have it;
 * - it stays queued for as long as the network is gone (OFFLINE_MS — longer than a few retries: a phone in a basement
 *   is offline for minutes, and an op must never be dropped because the network was down);
 * - the network is back → the lead reaches the server, nothing is lost, nothing is doubled.
 */
const { signIn, waitRows } = require("../signIn.cjs");

const OFFLINE_MS = 30_000;

exports.run = async (h, { seed, admin, ctx }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const A = a1.companyId;
  await signIn(h, a1);
  await h.go("/lead/new");
  await p.getByPlaceholder("Имя", { exact: true }).last().waitFor();

  // the network goes: nothing reaches the server from here on
  await ctx.setOffline(true);
  const name = `Nightly Offline ${String(Date.now()).slice(-5)}`;
  await p.getByPlaceholder("(555) 555-0100").last().pressSequentially(`818555${String(Date.now()).slice(-4)}`);
  await p.getByPlaceholder("Имя", { exact: true }).last().fill(name);
  await p.getByPlaceholder("Улица, дом, офис").last().fill("104 Offline Ave");
  await p.getByPlaceholder("Pasadena").last().fill("Burbank");
  await h.click("Сохранить лид");
  await p.waitForTimeout(700);
  const leadId = p.url().split("/lead/")[1];
  h.expect(!!leadId, `the lead card opens offline (${p.url()})`);
  await h.expectText(new RegExp(name), "the phone shows the lead at once (rule 6)");
  h.expect((await admin(`leads?id=eq.${leadId}&select=id`)).length === 0, "the server does not have it while offline");

  // a long time without network: the app keeps retrying and failing — the lead must stay queued, not be dropped
  await p.waitForTimeout(OFFLINE_MS);
  h.expect((await admin(`leads?id=eq.${leadId}&select=id`)).length === 0, "still not on the server while offline");
  await h.expectText(new RegExp(name), "the lead is still on the phone after the failed retries");
  await h.shot("offline");

  // the network is back: the queue goes out by itself
  await ctx.setOffline(false);
  const [lead] = await waitRows(admin, `leads?id=eq.${leadId}&select=id,company_id,contact_name`, (r) => r.length === 1, "the offline lead after the network came back", 30_000);
  h.expect(lead.company_id === A && lead.contact_name === name, `the offline lead reached the server (${JSON.stringify(lead)})`);
  h.expect((await admin(`leads?company_id=eq.${A}&contact_name=eq.${encodeURIComponent(name)}&select=id`)).length === 1, "exactly once (no double)");
  await h.go("/settings");
  await h.expectText(/Всё отправлено в базу/, "the queue is empty");
};
// offline: every request fails, and the app logs the failed sends
exports.allowConsole = [/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/];
