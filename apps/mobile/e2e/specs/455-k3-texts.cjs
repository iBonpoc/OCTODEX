/**
 * e2e 455 — К3 texts (#1223, #889). The demo company starts in Russian: the demo job visit's checklist comes in Russian
 * (the demo template is seeded in the app's language, as a module's starter), not «Protect floors and furniture».
 * Then the app is switched to English: the visit's signature field says «Client», not «Customer». Found by testID.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  // the tech at work on the demo job visit v1 (its checklist is the demo template's snapshot)
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  Object.assign(raw.db.visits.find((x) => x.id === "v1"), { step: "working", techId: raw.db.me, assigneeIds: [raw.db.me] });
  await h.seed("octo.db.v5", raw);
  await h.seed("octo.role.v1", "tech");
  await h.go("/visit/v1");
  const item = (n) => p.getByTestId(`chk-item-v1-c${n}`).last();
  await item(0).waitFor();
  const labels = [];
  for (let n = 0; n < 4; n++) labels.push((await item(n).innerText()).trim());
  h.expect(/Защитить пол и мебель/.test(labels[0]) && /Согласовать объём работ с клиентом/.test(labels[1]), `Russian items: ${labels.join(" | ")}`);
  h.expect(!labels.some((l) => /Protect floors|Confirm scope|Clean up|Walk through/.test(l)), "no English demo items in the Russian app");
  await item(0).scrollIntoViewIfNeeded();
  await h.shot("ru-checklist");

  // English: the signature field of the visit says «Client»
  await h.seed("octo.lang.v1", "en");
  await h.go("/visit/v1");
  const pad = p.getByTestId("signature-pad").last();
  await pad.waitFor();
  const said = `${await pad.getAttribute("aria-label")} ${await pad.innerText()}`;
  h.expect(/Client signs here/.test(said) && !/Customer/.test(said), `the sign field: ${said}`);  // i18n-old: ok (#889)
  await pad.scrollIntoViewIfNeeded();
  await h.shot("en-sign");
};
