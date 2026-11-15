/**
 * spec 35 §4д п.10 («Деньги и отчёты» №7): with the client's link anyone can sign as the client on /p/ — a tech does not get
 * it on the estimate screen. A sent estimate (demo e6, it has a link): the director sees «Отправить» (with «Копировать
 * ссылку» inside) and «Открыть как клиент»; a tech sees neither. The tech still sees the on-site signature (he may sign
 * contracts in the demo) — that goes by the estimate's id, no link.
 */
const { estMore, estAct, estHas } = require("../estimateMenu.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await setRole(h, "director");
  await h.go("/estimate/e6");
  await p.getByTestId("est-send").waitFor();
  h.expect(await estHas(p, "client"), "the director: «Как видит клиент» in «⋯»");
  await h.shot("director");

  await setRole(h, "tech");
  await h.go("/estimate/e6");
  await estMore(p);
  h.expect((await p.getByTestId("est-send").count()) === 0, "a tech: no «Отправить» (its sheet copies the link)");
  h.expect(!(await estHas(p, "client")), "a tech: no «Как видит клиент»");
  await h.expectText(/Подпись клиента на месте|Подписать на месте/, "the on-site signature is still there for him");
  await h.shot("tech");
  await setRole(h, "director");
};
