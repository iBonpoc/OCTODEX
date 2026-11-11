/**
 * #756 (A-01, A-02): the device storage fails (docs/audit/2026-11-11-full-audit.md §2).
 * - the outbox on the device is not JSON: the app is not loaded, the screen «Не удалось прочитать данные с устройства»
 *   with «Повторить»; the record on the device is never overwritten; once it can be read, «Повторить» opens the app;
 * - the device refuses a write (full storage): «Не сохранено на устройстве» in «Ещё», never «Онлайн · всё сохранено».
 */
exports.run = async (h) => {
  const p = h.page;
  const errorScreen = () => p.locator('[data-testid="storage-read-error"]:visible');
  const outbox = () => p.evaluate(() => localStorage.getItem("octo.outbox.v1"));

  // 1. a broken outbox record: the error screen, nothing written over it
  await h.go("/more");
  await p.locator('[data-testid="more-screen"]:visible').waitFor({ timeout: 5000 });
  await p.evaluate(() => localStorage.setItem("octo.outbox.v1", '[{"id":"op1"},'));
  await h.go("/more");
  await errorScreen().waitFor({ timeout: 5000 });
  await h.expectText(/Не удалось прочитать данные с устройства/, "the read-error screen");
  h.expect((await p.locator('[data-testid="more-screen"]').count()) === 0, "the app is not shown over the error");
  await p.waitForTimeout(500);
  h.expect((await outbox()) === '[{"id":"op1"},', `the broken outbox is kept as it is (${await outbox()})`);
  await h.shot("read-error");

  // «Повторить» while it is still broken: the error stays, still nothing written
  await p.locator('[data-testid="storage-read-retry"]:visible').click();
  await p.waitForTimeout(500);
  await errorScreen().waitFor({ timeout: 3000 });
  h.expect((await outbox()) === '[{"id":"op1"},', "after «Повторить» the record is still untouched");

  // the record can be read again: «Повторить» opens the app
  await p.evaluate(() => localStorage.setItem("octo.outbox.v1", "[]"));
  await p.locator('[data-testid="storage-read-retry"]:visible').click();
  await p.locator('[data-testid="more-screen"]:visible').waitFor({ timeout: 5000 });
  h.expect((await errorScreen().count()) === 0, "the error screen is gone");

  // 2. the device refuses writes of the role (full storage): «Не сохранено на устройстве», not «всё сохранено»
  await p.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "octo.role.v1") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await h.go("/more");
  const sync = p.locator('[data-testid="more-sync"]:visible');
  await sync.waitFor({ timeout: 5000 });
  await sync.locator('[data-testid="storage-not-saved"]').waitFor({ timeout: 5000 });
  const line = await sync.innerText();
  h.expect(/Не сохранено на устройстве/.test(line), `the line in «Ещё» (${line})`);
  h.expect(!/всё сохранено/.test(line), `never «всё сохранено» (${line})`);
  await h.shot("not-saved");
};
