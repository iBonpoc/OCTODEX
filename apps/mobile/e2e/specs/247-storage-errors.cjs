/**
 * #756 (A-01, A-02): the device storage fails (docs/audit/2026-11-11-full-audit.md §2).
 * - the outbox on the device is not JSON: the app is not loaded, the screen «Не удалось прочитать данные с устройства»
 *   with «Повторить»; the record on the device is never overwritten; once it can be read, «Повторить» opens the app;
 *   «Сохранить копию и продолжить» (after a confirmation) keeps the broken record aside and opens the app (review of #910);
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

  // 1b. broken again: «Сохранить копию и продолжить» — a confirmation, the copy kept, the app opens with an empty outbox
  await p.evaluate(() => localStorage.setItem("octo.outbox.v1", '[{"id":"op2"},'));
  await h.go("/more");
  await errorScreen().waitFor({ timeout: 5000 });
  await p.locator('[data-testid="storage-salvage"]:visible').click();
  await p.locator('[data-testid="storage-salvage-confirm"]:visible').waitFor({ timeout: 3000 });
  h.expect((await outbox()) === '[{"id":"op2"},', "nothing written before the confirmation");
  // the device has no room for the copy: «Продолжить» says so, the broken record stays
  await p.evaluate(() => {
    const set = Storage.prototype.setItem;
    window.__realSet = set;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).startsWith("octo.broken.")) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await p.locator('[data-testid="storage-salvage-yes"]:visible').click();
  await p.locator('[data-testid="storage-salvage-failed"]:visible').waitFor({ timeout: 3000 });
  h.expect((await outbox()) === '[{"id":"op2"},', "the copy refused: the broken record is not overwritten");
  await h.shot("salvage-confirm");
  await p.evaluate(() => (Storage.prototype.setItem = window.__realSet));
  await p.locator('[data-testid="storage-salvage-yes"]:visible').click();
  await p.locator('[data-testid="more-screen"]:visible').waitFor({ timeout: 5000 });
  const copies = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("octo.broken.octo.outbox.v1.")).map((k) => localStorage.getItem(k)));
  h.expect(copies.length === 1 && copies[0] === '[{"id":"op2"},', `the broken record is kept aside (${JSON.stringify(copies)})`);
  h.expect((await outbox()) === "[]", `the outbox starts empty (${await outbox()})`);

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
  h.expect((await sync.locator('[data-testid="more-sync-ok"]').count()) === 0, "never «Онлайн · всё сохранено»");
  await h.shot("not-saved");
};
