/**
 * e2e 352 — «Замеры» и «Просмотр замера»: состояния экрана по дизайн-системе (#1426, дизайн-аудит 14.11; DS §12.2, §13).
 * Every view.
 * - an empty «Замеры» is the `Empty` state (icon, words, why, the one main button «Новый замер»), not a grey paragraph;
 * - «＋ Новый замер» in the header is secondary: nothing yellow in it (yellow is the screen's main action only);
 * - «Просмотр замера» of a measurement that is not there is the `NotFound` state with «К списку замеров», which goes to the list.
 * Finds things by testID; waits on what it checks.
 */
const ACC = "rgb(251, 255, 0)"; // design-tokens: acc #FBFF00 (both themes), as e2e/accent.cjs

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  /** any visible part of the element filled with acc */
  const yellowIn = (id) =>
    p.evaluate(
      ([id, acc]) => {
        const box = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((el) => el.getBoundingClientRect().width > 0);
        if (!box) return null;
        return [box, ...box.querySelectorAll("*")].some((el) => getComputedStyle(el).backgroundColor === acc);
      },
      [id, ACC],
    );

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });

  // an empty list: the Empty state with its own main button
  await h.go("/module/gutters/list");
  await tid("measurements-empty").waitFor({ timeout: 8000 });
  await tid("measurements-empty-new").getByRole("button", { name: "Новый замер" }).waitFor({ timeout: 5000 });
  h.expect(/Замеров пока нет/.test(await p.locator("body").innerText()), "the empty list says «Замеров пока нет»");

  // the header's «＋» is there and is not yellow (DS §12.2: creating is secondary in the header)
  await tid("measurements-new").getByRole("button", { name: "Новый замер" }).waitFor({ timeout: 5000 });
  h.expect((await yellowIn("measurements-new")) === false, "the header's «Новый замер» is secondary, not acc");
  await h.shot("empty");

  // a measurement that is not there: NotFound, and its button goes back to the list
  await h.go("/module/gutters/view?m=nope");
  await tid("not-found").waitFor({ timeout: 8000 });
  h.expect(/Замер не найден/.test(await p.locator("body").innerText()), "it says «Замер не найден»");
  await h.shot("not-found");
  await tid("not-found-back").getByRole("button", { name: "К списку замеров" }).click();
  await p.waitForURL(/\/module\/gutters\/list/, { timeout: 8000 });
  await tid("measurements-empty").waitFor({ timeout: 8000 });

  // the header's «＋» opens the canvas
  await tid("measurements-new").getByRole("button", { name: "Новый замер" }).click();
  await p.waitForURL(/\/module\/gutters\/draw/, { timeout: 8000 });
  await tid("draw-surface").waitFor({ timeout: 8000 });
};
