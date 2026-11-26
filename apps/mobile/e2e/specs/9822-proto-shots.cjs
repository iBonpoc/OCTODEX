/** PROTO #2822 (never merge): snapshots of the «client signed meanwhile» card — triage, the press, profile. */
const DB_KEY = "octo.db.v5";
const REJ = "octo.cloud.v1.rejected";
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/today");
  await p.evaluate(({ k, rk }) => {
    const s = JSON.parse(localStorage.getItem(k));
    const e = s.db.estimates.find((x) => x.doc && x.customerId && x.propertyId);
    e.status = "approved"; e.approval = { ...(e.approval ?? {}), at: new Date(Date.now() - 3600_000).toISOString(), name: "Client" };
    localStorage.setItem(k, JSON.stringify(s));
    const card = { id: "r-proto", kind: "estimate.save", what: "estimate", href: `/estimate/${e.id}`, labelKey: "est.rej.signedMeanwhile",
      reason: "estimate_signed_meanwhile", error: "estimate_signed_meanwhile", at: new Date(Date.now() - 60_000).toISOString(),
      estimateEdit: { title: e.title, customerId: e.customerId, propertyId: e.propertyId, doc: e.doc } };
    localStorage.setItem(rk, JSON.stringify([card]));
  }, { k: DB_KEY, rk: REJ });
  await h.go("/settings/profile");
  await p.waitForTimeout(800);
  await p.getByText("Сервер отказал", { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await p.waitForTimeout(300);
  await h.shot("profile");
  await h.go("/triage");
  await tid("rejected-choose-r-proto").waitFor({ timeout: 8000 });
  await tid("rejected-choose-r-proto").scrollIntoViewIfNeeded();
  await h.shot("triage");
  await tid("rejected-choose-r-proto").click();
  await p.waitForTimeout(900);
  await h.shot("press");
};
