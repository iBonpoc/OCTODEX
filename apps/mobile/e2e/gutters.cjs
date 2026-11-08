// Gutters canvas: right after a gutter is drawn the «Длина желоба» sheet opens (feet focused). Tests that do not
// check the length close it with «Пропустить» — the drawn length stays.
async function skipLength(p) {
  const skip = p.getByTestId("quick-length-skip").locator("visible=true").first();
  try {
    await skip.waitFor({ timeout: 2000 });
  } catch {
    return; // nothing was drawn (a stroke too short, a corner drag, read-only)
  }
  await skip.click();
  await p.getByTestId("quick-length").locator("visible=true").first().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
}

module.exports = { skipLength };
