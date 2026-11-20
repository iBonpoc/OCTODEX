/**
 * «Наряд / Графит» (#2292, Ш2), every view: the colour set is chosen in the hidden developer card of «Настройки».
 * С1 ДАНО свежая установка КОГДА открыть «Настройки» ТОГДА карточки «Для разработчика» нет, цвет экрана — «Наряд».
 * С2 КОГДА семь быстрых нажатий на знак в «О приложении» ТОГДА карточка открыта.
 * С3 КОГДА включить «Цвета „Графит“» ТОГДА фон экрана меняется на цвет «Графита».
 * С4 КОГДА выключить ТОГДА фон — как в «Наряде».
 */
exports.run = async (h) => {
  const p = h.page;
  // the first painted background above the «О приложении» card: a card colour (`surf`) of the chosen set
  const paint = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
    }
    return "";
  };
  const bg = () => p.getByTestId("settings-about").locator("visible=true").first().evaluate(paint);
  await h.go("/settings");
  await p.getByTestId("settings-about").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("settings-dev").count()) === 0, "С1: no developer card by default");
  const before = await bg();
  const brand = p.getByTestId("about-brand").locator("visible=true").first();
  // a real touch end (the web's touch normaliser reads its touch list): seven in a row
  await brand.evaluate((el) => {
    for (let i = 0; i < 7; i++) {
      const t = new Touch({ identifier: i, target: el, clientX: 1, clientY: 1 });
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
    }
  });
  await p.getByTestId("settings-dev").locator("visible=true").first().waitFor({ timeout: 5000 });
  const sw = p.getByTestId("dev-skin-graphite-switch").locator("visible=true").first();
  await sw.click();
  await p.waitForFunction(([b, fn]) => { const el = [...document.querySelectorAll('[data-testid="settings-about"]')].find((e) => e.offsetParent); return !!el && new Function("el", `return (${fn})(el)`)(el) !== b; }, [before, paint.toString()], { timeout: 5000 });
  await p.getByTestId("dev-skin-graphite-switch").locator("visible=true").first().click();
  await p.waitForFunction(([b, fn]) => { const el = [...document.querySelectorAll('[data-testid="settings-about"]')].find((e) => e.offsetParent); return !!el && new Function("el", `return (${fn})(el)`)(el) === b; }, [before, paint.toString()], { timeout: 5000 });
};
