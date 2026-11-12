/**
 * e2e 266 — a tech and an older quick estimate on site (#1126). The bug: on a draft the tech had the client sign on his phone;
 * the phone showed «awaiting the company's signature», the server refused (a tech may not send — the server signs only a
 * sent, locked version) and the client's signature was lost. Now a draft shows «the office sends it first» and no signature
 * pad; once sent, the client signs on his phone as before.
 * The demo seed: e4 is a quick estimate (no document) of the tech's (m-alex); made a draft here, from a page without the app.
 */
async function setStatus(h, status) {
  const raw = await h.page.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  Object.assign(raw.db.estimates.find((x) => x.id === "e4"), { status });
  await h.seed("octo.db.v5", raw);
}

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await h.seed("octo.role.v1", "tech");

  await setStatus(h, "draft");
  await h.go("/estimate/e4");
  await p.getByTestId("est-sign-after-send").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("est-sign-on-site").count()) === 0, "the tech, a draft: no signature pad");
  await h.shot("tech-draft");

  await setStatus(h, "sent");
  await h.go("/estimate/e4");
  await p.getByTestId("est-sign-on-site").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("est-sign-after-send").count()) === 0, "the tech, a sent one: the client signs on his phone");
};
