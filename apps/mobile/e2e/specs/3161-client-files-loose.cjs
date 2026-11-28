/**
 * e2e 3161 — «Фото и файлы» of a client: a photo without a visit (#3085) the cloud refused has «Повторить» and «Удалить» there
 * (it has no visit to do it from), and «＋» is shown only to whom the database lets add it (files_insert, T474). Every view, by
 * testID; waits on what it checks:
 * - the office: the refused photo opens with «Повторить» — pressed, the mark goes; «Удалить фото» — off the client, «Вернуть» brings it back;
 * - a subcontractor (the app role «tech») on a client he works for: no «＋»; a tech of that client: «＋».
 */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/");
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db, null, { timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const me = raw.db.me;
  const mine = (v) => v.techId === me || (v.assigneeIds ?? []).includes(me);
  // the client of a job of a visit of mine (today, so it counts for a tech)
  const now = await p.evaluate(() => Date.now());
  const v = raw.db.visits.find((x) => mine(x) && x.jobId && raw.db.jobs.find((j) => j.id === x.jobId)?.customerId);
  h.expect(!!v, "the demo has a visit of mine on a client's job");
  const cid = raw.db.jobs.find((j) => j.id === v.jobId).customerId;
  raw.db.visits = raw.db.visits.map((x) => (x.id === v.id ? { ...x, start: new Date(now).toISOString(), closed: false, step: "scheduled" } : x));
  raw.db.files = [...(raw.db.files ?? []), { id: "f3161", kind: "photo", customerId: cid, at: new Date(now).toISOString(), uri: PNG, upload: { failed: "refused", at: new Date(now).toISOString() } }];
  await h.seed("octo.db.v5", raw);
  const waitFile = (test) =>
    p.waitForFunction((src) => new Function("f", `return (${src})(f)`)((JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.files ?? []).find((f) => f.id === "f3161") ?? null), String(test), { timeout: 6000 }).then(() => true, () => false);

  // the office: «Повторить» on the refused photo
  await h.go(`/client/files/${cid}`);
  await tid("client-files-loose").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("client-files-add").locator("visible=true").count()) === 1, "the office has «＋»");
  await tid("photo-thumb-f3161").click();
  await tid("photo-upload-retry").waitFor({ timeout: 5000 });
  await h.shot("refused");
  await tid("photo-upload-retry").click();
  h.expect(await waitFile((f) => !!f && !f.upload), "«Повторить»: the mark is off, the photo is sent again");

  // «Удалить фото»: off the client; «Вернуть» brings it back
  await tid("photo-thumb-f3161").click();
  await p.getByTestId("photo-delete").locator("visible=true").last().click();
  await tid("client-files-loose").waitFor({ state: "detached", timeout: 5000 });
  h.expect(await waitFile((f) => !f), "«Удалить фото»: the photo is off the client");
  // «Вернуть» of the toast «Фото удалено» (the one of «Повторить» may still be there), once it is armed (CHECKS §9 №31)
  const undo = p.getByTestId("toast").filter({ hasText: "Фото удалено" }).locator("visible=true").last().getByTestId("toast-undo");
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="toast"]')].some((t) => /Фото удалено/.test(t.innerText) && t.querySelector('[data-testid="toast-undo"]')?.getAttribute("aria-busy") !== "true"), null, { timeout: 5000 });
  await undo.click();
  await tid("photo-thumb-f3161").waitFor({ timeout: 5000 });
  h.expect(await waitFile((f) => !!f), "«Вернуть» brought it back (on the phone too)");

  // a subcontractor working for this client: no «＋» (the database refuses him any client's photo)
  const raw2 = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw2.db.members = raw2.db.members.map((m) => (m.id === me ? { ...m, kind: "sub" } : m));
  await h.seed("octo.db.v5", raw2);
  await h.seed("octo.role.v1", "tech");
  await h.go(`/client/files/${cid}`);
  await tid("client-files-loose").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("client-files-add").locator("visible=true").count()) === 0, "a subcontractor has no «＋»");
  await h.shot("sub");

  // a tech (not a subcontractor) of this client: «＋»
  const raw3 = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw3.db.members = raw3.db.members.map((m) => (m.id === me ? { ...m, kind: "staff" } : m));
  await h.seed("octo.db.v5", raw3);
  await h.go(`/client/files/${cid}`);
  await tid("client-files-add").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("client-files-add").locator("visible=true").count()) === 1, "a tech of the client has «＋»");
};
