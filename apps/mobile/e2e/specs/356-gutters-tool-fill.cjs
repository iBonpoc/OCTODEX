/**
 * e2e 356 — холст Gutters: выбранный инструмент — «Заливка», не жёлтый (#1426, дизайн-аудит 14.11; DS «Выделение выбранного», §19а).
 * Every view.
 * - the toolbar has no yellow (acc) at all: yellow is only the screen's main action;
 * - the chosen tool says so (pressed) and is the only filled circle of the bar (a fill with its shadow); the other tool, the
 *   actions (↶ ↷ 🗑) and the storey have none; picking the other moves the fill.
 * Finds things by testID; waits on what it checks.
 */
const ACC = "rgb(251, 255, 0)"; // design-tokens: acc #FBFF00 (both themes), as e2e/accent.cjs

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  /** the cell's look: any part filled with acc; its own fill (the circle under the icon); selected for the screen reader */
  const look = (id) =>
    p.evaluate(
      ([id, acc]) => {
        const box = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((el) => el.getBoundingClientRect().width > 0);
        if (!box) return null;
        const all = [box, ...box.querySelectorAll("*")];
        const btn = box.querySelector('[role="button"]');
        // the 36 circle under the icon: the innermost div that holds the icon (the outer ones are the 44 touch area)
        const circle = btn ? [...btn.querySelectorAll("div")].reverse().find((d) => d.querySelector("svg") && d.getBoundingClientRect().height >= 30) : null;
        const bg = circle ? getComputedStyle(circle).backgroundColor : "";
        return {
          yellow: all.some((el) => getComputedStyle(el).backgroundColor === acc),
          filled: !!bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent",
          // «Заливка» is the fill AND the small shadow (DS: surf2 + shadow-sm)
          shadow: !!circle && getComputedStyle(circle).boxShadow !== "none",
          selected: btn?.getAttribute("aria-pressed") === "true",
        };
      },
      [id, ACC],
    );

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await tid("draw-tool-line").waitFor({ timeout: 5000 });

  // «Желоб» is the tool at the start: chosen, filled, not yellow; «Водосток»: not chosen, no fill
  let line = await look("draw-tool-line"), ds = await look("draw-tool-ds");
  h.expect(line.selected && line.filled && line.shadow && !line.yellow, `the chosen tool: selected, a fill with its shadow, no yellow (${JSON.stringify(line)})`);
  h.expect(!ds.selected && !ds.filled && !ds.yellow, `the other tool: no fill (${JSON.stringify(ds)})`);
  // the chosen tool is the ONLY filled circle of the bar: the actions and the storey are icons (a ring) without a fill (DS §19а, design review)
  for (const id of ["draw-story", "draw-undo", "draw-redo", "draw-delete"]) {
    const l = await look(id);
    h.expect(!l.yellow && !l.filled, `${id}: no yellow, no fill (${JSON.stringify(l)})`);
  }
  await h.shot("line");

  // pick «Водосток»: the fill moves to it
  await tid("draw-tool-ds").getByRole("button").click();
  await p.waitForFunction(() => document.querySelector('[data-testid="draw-tool-ds"] [role="button"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 5000 });
  line = await look("draw-tool-line");
  ds = await look("draw-tool-ds");
  h.expect(ds.selected && ds.filled && !ds.yellow && !line.filled, `after the pick: «Водосток» filled, «Желоб» not (${JSON.stringify({ line, ds })})`);
};
