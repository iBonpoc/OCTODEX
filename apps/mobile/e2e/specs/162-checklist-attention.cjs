/**
 * e2e 162 — «Не сделано» in «Требует внимания» (docs/specs/08 §8, В4; step 14 CH2b; S15).
 * A signed visit with a required item left open: one warn card «{client} · выезд {date}: не сделано 1». «Просмотрено»
 * takes it away (the item stays «not done» in the visit), «Отменить» brings it back. The item done later — the card
 * goes by itself.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/triage");
  const id = await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    const v = s.db.visits.find((x) => x.jobId && x.step === "scheduled");
    Object.assign(v, {
      step: "signed", signature: "M0 0", photos: [{ id: "e162-b", kind: "before" }, { id: "e162-a", kind: "after" }],
      checklist: [
        { id: "e162-r", label: "Walk through", done: false, kind: "check", required: true },
        { id: "e162-o", label: "Gate code", done: false, kind: "check", required: false },
      ],
    });
    localStorage.setItem(k, JSON.stringify(s));
    return v.id;
  });
  await h.go("/triage");
  const reviewed = p.getByRole("button", { name: "Просмотрено", exact: true }).last();
  await reviewed.waitFor();
  await h.expectText(/выезд [A-Z][a-z]{2} \d{1,2}: не сделано 1/, "the card says what is undone");
  await h.expectText(/Не сделано/, "the warn chip with its word");
  await h.shot("card");

  // «Просмотрено»: the card goes, the item stays «not done»; «Отменить» brings it back
  await reviewed.click();
  for (let i = 0; i < 20 && !(await h.db()).visits.find((x) => x.id === id).checklistReviewedAt; i++) await p.waitForTimeout(150);
  let v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(!!v.checklistReviewedAt && !v.checklist.find((x) => x.id === "e162-r").done, "reviewed; the item is still not done");
  await p.getByRole("button", { name: "Просмотрено", exact: true }).waitFor({ state: "detached" });
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  for (let i = 0; i < 20 && (await h.db()).visits.find((x) => x.id === id).checklistReviewedAt; i++) await p.waitForTimeout(150);
  h.expect(!(await h.db()).visits.find((x) => x.id === id).checklistReviewedAt, "«Отменить»: not reviewed again");
  await reviewed.waitFor();

  // who sees it (the office only, not a tech or sales): unit attentionChecklist — a tech has no «Требует внимания» screen

  // the item done later (the tech finishes it): the card goes by itself
  await p.evaluate((vid) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.visits.find((x) => x.id === vid).checklist[0].done = true;
    localStorage.setItem(k, JSON.stringify(s));
  }, id);
  await h.go("/triage");
  h.expect(!/не сделано 1/.test(await h.text()), "done: no card");
  h.expect((await p.getByRole("button", { name: "Просмотрено", exact: true }).count()) === 0, "no «Просмотрено» either");
};
