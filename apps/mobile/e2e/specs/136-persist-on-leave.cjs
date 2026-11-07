/**
 * e2e 136 — a change made just before the app is left is not lost (rule 6; review #263, «the lost 250 ms»).
 * The phone keeps its copy with a 250 ms pause (one write for a burst of changes). The page is left right after a
 * change — a reload is what a closed tab or a killed app is on the web (`pagehide`) — and the change is still there:
 * what waits is written when the app leaves (persist.flushAllWriters), the outbox at once.
 * Demo data, every width and theme.
 */
exports.run = async (h) => {
  const p = h.page;
  const name = `Persist ${h.layout.width}${h.layout.theme === "dark" ? "d" : "l"}`;
  await h.go("/lead/new");
  await p.getByPlaceholder("(555) 555-0100").last().pressSequentially(`626555${String(1000 + h.layout.width).slice(-4)}`);
  await p.getByPlaceholder("Имя", { exact: true }).last().fill(name);
  await p.getByPlaceholder("Улица, дом, офис").last().fill("136 Leave St");
  await p.getByPlaceholder("Pasadena").last().fill("Glendale");
  // no helper here: h.click waits 350 ms — longer than the pause this test is about
  await p.getByRole("button", { name: "Сохранить лид", exact: true }).last().click();
  // the change is on the screen (the lead's card opened) — and the page is left at once, well within 250 ms
  await p.waitForURL(/\/lead\/(?!new)[^/?]+/, { timeout: 5000 });
  await p.getByText(name, { exact: true }).first().waitFor({ timeout: 5000 });
  await p.reload();
  await p.waitForTimeout(1000);

  const db = await h.db();
  h.expect(!!db && db.leads.some((l) => l.name === name), `the lead made just before leaving is kept (${name})`);
  await h.go("/leads?tab=leads");
  await h.expectText(new RegExp(name), "and it is in the list after the restart");
  await h.shot("kept");
};
