/**
 * e2e 501 — #1441: a measurement's photo the cloud did not take is told, as a visit's photo (e2e 383): the strip of «Просмотр замера»
 * says how many, the viewer says why, «Повторить» only for a plain refusal of a file on this phone; it sends the file again and the
 * mark goes, the others keep theirs. The phone's data holds a lead's measurement with three refused photos — refused with the file
 * here, too big with the file here, refused on another phone (no file here). Every view. Waits on what it checks; ids by testID.
 */
const { showSection } = require("../gutters.cjs");
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");

const KEY = "octo.db.v5";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const AT = "2026-11-18T10:00:00Z";
const M = "e2e-501-m";

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const markOf = (id) => p.evaluate(([k, x]) => (JSON.parse(localStorage.getItem(k) || "null")?.db?.files || []).find((f) => f.id === x)?.upload?.failed ?? null, [KEY, id]);
  const waitMark = (id, want) =>
    p.waitForFunction(([k, x, w]) => ((JSON.parse(localStorage.getItem(k) || "null")?.db?.files || []).find((f) => f.id === x)?.upload?.failed ?? null) === w, [KEY, id, want], { timeout: 8000 });
  const reasonOf = async (thumb) => {
    await vis(thumb).click();
    const reason = h.sheet().getByTestId("photo-upload-reason");
    await reason.waitFor({ timeout: 5000 });
    return reason.innerText();
  };

  await h.go("/company/modules");
  await vis("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });

  // a lead's measurement with one run and three refused photos (seeded from a page without the app, CHECKS §9 №12)
  await h.go("/today");
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const lead = raw.db.leads.find((l) => l.propertyId) || raw.db.leads[0];
  const g = raw.db.moduleData?.gutters || { measurements: [], elements: [] };
  const run = { id: "e2e-501-r", measurementId: M, kind: "run", geom: { a: [0, 0], b: [240, 0], lengthIn: 240 }, attrs: { profile: "k", size: "5", material: "aluminum", gauge: ".027", color: "white", story: 1, mount: "fascia", hanger: "hidden" }, confidence: "drawn" };
  raw.db.moduleData = { ...raw.db.moduleData, gutters: { measurements: [...g.measurements.filter((m) => m.id !== M), { id: M, label: null, status: "draft", propertyId: lead.propertyId ?? null, leadId: lead.id }], elements: [...g.elements.filter((e) => e.measurementId !== M), run] } };
  raw.db.files = [
    ...(raw.db.files || []).filter((f) => !String(f.id).startsWith("e501-")),
    { id: "e501-here", kind: "photo", measurementId: M, uri: PNG, at: AT, upload: { failed: "refused", at: AT } },
    { id: "e501-big", kind: "photo", measurementId: M, uri: PNG, at: AT, upload: { failed: "tooBig", at: AT } },
    { id: "e501-far", kind: "photo", measurementId: M, at: AT, upload: { failed: "refused", at: AT } },
  ];
  await h.seed(KEY, raw);

  // ---- «Просмотр замера»: the strip says how many
  await h.go(`/module/gutters/view?m=${M}`);
  await showSection(p, "view-photo-strip"); // #3028: on «Фото»
  await vis("view-photo-strip").waitFor({ timeout: 10000 });
  await vis("photo-upload-failed").waitFor({ timeout: 10000 });
  const note = await vis("photo-upload-failed").innerText();
  h.expect(note.includes("Не загрузились в облако: 3"), `the strip: how many (${note})`);
  await vis("photo-upload-failed").scrollIntoViewIfNeeded();
  await h.shot("strip");

  // refused on another phone: why, no «Повторить» (nothing to send from here)
  const far = await reasonOf("photo-thumb-e501-far");
  h.expect(far.includes("Облако не приняло фото.") && far.includes("Файл остался на телефоне, с которого снимали."), `another phone's photo: ${far}`);
  h.expect((await h.sheet().getByTestId("photo-upload-retry").count()) === 0, "no «Повторить» without the file");
  await pressEscUntilClosed(p);

  // too big: no «Повторить» that would fail again
  const big = await reasonOf("photo-thumb-e501-big");
  h.expect(big.includes("Файл больше 25 МБ"), `too big: why (${big})`);
  h.expect((await h.sheet().getByTestId("photo-upload-retry").count()) === 0, "too big: no «Повторить»");
  await pressEscUntilClosed(p);

  // a plain refusal with the file here: «Повторить» sends it again — the mark goes, the others keep theirs
  h.expect((await reasonOf("photo-thumb-e501-here")).includes("Облако не приняло фото."), "a plain refusal");
  await h.shot("viewer");
  await h.sheet().getByTestId("photo-upload-retry").click();
  await sheetGone(p);
  await waitMark("e501-here", null);
  await vis("photo-upload-failed").filter({ hasText: "Не загрузились в облако: 2" }).waitFor({ timeout: 5000 });
  h.expect((await markOf("e501-far")) === "refused" && (await markOf("e501-big")) === "tooBig", "the other photos keep their marks");

  // a reload keeps the marks on this phone
  await h.go(`/module/gutters/view?m=${M}`);
  await showSection(p, "view-photo-strip"); // #3028: on «Фото»
  await vis("photo-upload-failed").waitFor({ timeout: 10000 });
  h.expect((await vis("photo-upload-failed").innerText()).includes("Не загрузились в облако: 2"), "after a reload: still 2");
};
