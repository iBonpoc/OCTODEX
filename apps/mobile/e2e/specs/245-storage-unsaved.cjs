/**
 * e2e 245 — «Не сохранено на устройстве» (#756, audit A-01/A-02, «Ядро: надёжность данных» №1).
 * The phone's storage fails: a read that fails never lets the app write over what is stored (before: the state was
 * «loaded empty» and its initial value went over the saved one — the outbox with it); a write that fails is not
 * swallowed: the sync badge says so, and once storage works again the value is written and the badge goes.
 * On the web the storage is localStorage: the page's own Storage methods are made to throw. Every view.
 */
exports.run = async (h) => {
  const p = h.page;
  const waitFor = async (ok, what, tries = 60) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const badge = () => p.getByTestId("storage-badge").locator("visible=true").first();
  const shown = async () => (await p.getByTestId("storage-badge").locator("visible=true").count()) > 0;
  const stored = (k) => p.evaluate((key) => window.__realGet(key), k);

  // the storage breaks on the next start: reads of the Today period throw, writes throw while __full is on
  await p.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    window.__realGet = (k) => get.call(localStorage, k);
    window.__unreadable = new Set(["octo.todayPeriod.v1"]);
    window.__full = sessionStorage.getItem("e2e.full") === "1"; // sessionStorage keys are not «octo.»: never blocked
    Storage.prototype.getItem = function (k) {
      if (window.__unreadable.has(k)) throw new Error("Row too big to fit into CursorWindow");
      return get.call(this, k);
    };
    Storage.prototype.setItem = function (k, v) {
      if (window.__full && String(k).startsWith("octo.")) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.todayPeriod.v1", JSON.stringify("week")));
  await p.reload();

  // A-01: the read fails → after its retries the app works on, the stored value is held, not written over
  await badge().waitFor({ timeout: 10000 });
  h.expect((await badge().getAttribute("aria-label")) === "Не сохранено на устройстве", "a failed read: the badge says «Не сохранено на устройстве»");
  await p.waitForTimeout(1000);
  h.expect((await stored("octo.todayPeriod.v1")) === JSON.stringify("week"), "a failed read: the stored value is not written over");
  await h.shot("read-failed");
  // the storage reads again: the held value is read back (the held retry, ≤ 5 s), the badge goes
  await p.evaluate(() => window.__unreadable.clear());
  await waitFor(async () => !(await shown()), "read again: the badge goes");
  h.expect((await stored("octo.todayPeriod.v1")) === JSON.stringify("week"), "read again: the stored value is kept");

  // A-02: the storage is full on the next start → the first writes (the queue, the outbox: written at once) fail:
  // the badge says so, not silence; storage free again → the retry writes and the badge goes
  await p.evaluate(() => sessionStorage.setItem("e2e.full", "1"));
  await p.evaluate(() => localStorage.removeItem("octo.queue.v1"));
  await p.reload();
  await badge().waitFor({ timeout: 10000 });
  h.expect((await badge().getAttribute("aria-label")) === "Не сохранено на устройстве", "a failed write: the badge says «Не сохранено на устройстве»");
  h.expect((await stored("octo.queue.v1")) === null, "a failed write: nothing was written");
  await h.shot("write-failed");
  // the storage badge never hides the sync badge (review of #763 №9): offline → both are seen side by side
  await h.go("/settings");
  await badge().waitFor({ timeout: 10000 });
  await p.getByRole("switch", { name: "Проверка: режим без сети" }).click();
  await p.getByTestId("sync-badge").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(await shown(), "offline and unsaved: the storage badge stays next to the sync badge");
  await h.shot("both-badges");
  await p.evaluate(() => { window.__full = false; sessionStorage.removeItem("e2e.full"); });
  await waitFor(async () => (await stored("octo.queue.v1")) !== null, "storage free again: the queue is written by the retry");
  await waitFor(async () => !(await shown()), "storage free again: the badge goes");
};
