const { atMinute, todayKey, addDays } = require("../companyTime.cjs");
/**
 * #3076 «Фото и файлы» клиента: the row in the client's «Журнал» has «›» and the count; it opens /client/files/<id> — the photos
 * of the client's visits as a grid by visit (the newest first), «Выезд ›» opens the visit, a photo opens the viewer, the other
 * files are rows; the «Объект» / «Работа» fields show only when there is more than one to choose.
 */
// a small picture as a data address (it survives a reload, unlike a `blob:`)
const zlib = require("node:zlib");
const { pressEscUntilClosed } = require("../sheet.cjs");
// a small one-colour PNG as a data address (it survives a reload, unlike a `blob:`)
const px = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array(8).fill([r, g, b]).flat()])));
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
};
exports.run = async (h) => {
  const p = h.page;
  await h.go("/client/c1?tab=log");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const today = todayKey();
  const earlier = atMinute(addDays(today, -6), 9 * 60);
  raw.db.visits = raw.db.visits.map((v) =>
    v.id !== "v1" ? v : { ...v, photos: [{ id: "ph1", kind: "before", uri: px("8a9bb0") }, { id: "ph2", kind: "before", uri: px("b0a08a") }, { id: "ph3", kind: "after", uri: px("8ab09a") }] },
  );
  raw.db.visits.push({
    id: "v3076", jobId: "j1", techId: raw.db.me, assigneeIds: [raw.db.me], start: earlier, durationMin: 60, step: "done", closed: true, scope: [], checklist: [], amountDueCents: 0,
    photos: [{ id: "ph4", kind: "before", uri: px("a08ab0") }, { id: "ph5", kind: "after", uri: px("9ab08a") }],
  });
  raw.db.files = [...(raw.db.files || []), { id: "f3076", kind: "document", jobId: "j1", at: earlier }, { id: "ph1", kind: "photo", visitId: "v1", jobId: "j1", at: earlier }];
  await h.seed("octo.db.v5", raw);
  await h.go("/client/c1?tab=log");

  // the row: «›» and the count — 5 photos + 1 document (the file row of ph1 is the visit's photo: counted once)
  const row = p.getByTestId("client-files-row").locator("visible=true").first();
  await row.scrollIntoViewIfNeeded();
  h.expect(/Фото и файлы[\s\S]*6/.test(await row.innerText()), `row says «Фото и файлы» and 6: ${await row.innerText()}`);
  await h.shot(1);
  await row.click();
  await p.waitForURL(/\/client\/files\/c1/);
  await p.getByTestId("client-files").locator("visible=true").first().waitFor();

  // groups by visit, the newest first; one property and one job — no filter fields
  // (a group's count pill is «<testID>-count»: only the groups themselves)
  const ids = await p.locator('[data-testid^="client-files-visit-"]').locator("visible=true").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).filter((x) => !x.endsWith("-count")));
  h.expect(ids.join() === "client-files-visit-v1,client-files-visit-v3076", `two visits with photos, today's first: ${ids}`);
  h.expect((await p.getByTestId("client-files-property").count()) === 0, "one property: no «Объект» field");
  h.expect((await p.getByTestId("photo-thumb-ph3").locator("visible=true").count()) === 1, "the visit's photos are in the grid");
  h.expect((await p.getByTestId("client-file-f3076").locator("visible=true").count()) === 1, "the document is a row");
  h.expect((await p.getByTestId("client-file-ph1").count()) === 0, "a visit's photo kept as a file row is not shown twice");
  await h.expectText(/Фото и файлы/, "the screen's title");
  await h.shot(2);

  // a photo opens the viewer (read-only here: no «Удалить»)
  await p.getByTestId("photo-thumb-ph3").locator("visible=true").first().click();
  await h.expectText(/Фото после/, "the viewer of an after photo");
  h.expect((await h.sheet().getByRole("button", { name: /Удалить/ }).count()) === 0, "no delete in the client's files");
  await h.shot(3);
  await pressEscUntilClosed(p);

  // the visit's row «›» opens the visit
  await p.getByTestId("client-files-open-v3076").locator("visible=true").first().click();
  await p.waitForURL(/\/visit\/v3076/);
};
