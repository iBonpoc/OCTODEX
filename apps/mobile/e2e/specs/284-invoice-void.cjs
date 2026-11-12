/**
 * В1-5 (#1107) + В1-4б (#865): a wrong invoice is voided and the right one issued. The director bills job j6 in full
 * (a mistake), opens the invoice → «⋯» → «Аннулировать» → writes the reason → «Аннулировать». The invoice leaves the
 * sums (it moves to voidInvoices), the statement shows it as «Аннулирован» with the reason, and «Выставить остаток»
 * is there again; the right invoice goes through. The server's side — db T197.
 */
exports.run = async (h) => {
  const p = h.page;
  const pick = async (pred, what) => {
    await p.waitForFunction((src) => {
      const db = JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db;
      return !!db && new Function("db", `return (${src})(db)`)(db);
    }, pred.toString());
    h.expect(true, what);
    return h.db();
  };
  await h.go("/job/j6");
  await p.getByTestId("job-tab-money").locator("visible=true").click();
  await p.getByTestId("statement-bill-balance").click();
  let db = await pick((d) => d.invoices.some((i) => i.jobId === "j6"), "the wrong invoice is issued");
  const wrong = db.invoices.find((i) => i.jobId === "j6");
  // nothing more fits the contract: the buttons are gone
  await p.getByTestId("statement-bill-balance").waitFor({ state: "detached" });
  h.expect(true, "the contract is billed in full: «Выставить остаток» is gone");

  await h.go(`/invoice/${wrong.id}`);
  await p.getByTestId("invoice-more").locator("visible=true").click();
  await h.sheet().getByTestId("invoice-void-item").click();
  await h.sheet().getByTestId("invoice-void-reason").locator("input, textarea").fill("Wrong amount");
  await h.sheet().getByTestId("invoice-void-confirm").getByRole("button").click();
  db = await pick((d) => (d.voidInvoices ?? []).some((i) => i.voidReason === "Wrong amount"), "the invoice is voided with its reason");
  h.expect(!db.invoices.some((i) => i.id === wrong.id), "the voided invoice left the live ones (no sum counts it)");
  await p.getByTestId("invoice-void-status").waitFor();
  h.expect(/Wrong amount/.test(await p.getByTestId("invoice-void-reason-line").innerText()), "its screen says why");

  await h.go("/job/j6");
  await p.getByTestId("job-tab-money").locator("visible=true").click();
  await p.getByTestId(`statement-void-${wrong.id}`).waitFor();
  await p.waitForFunction(() => /\$0(\.00)?$/.test((document.querySelector('[data-testid="statement-invoiced"]')?.textContent ?? "").trim()));
  h.expect(true, "the statement counts nothing for it (Выставлено $0)");
  await p.getByTestId("statement-bill-balance").click();
  db = await pick((d) => d.invoices.some((i) => i.jobId === "j6"), "the right invoice goes through");
  h.expect(db.invoices.filter((i) => i.jobId === "j6").length === 1 && db.voidInvoices.filter((i) => i.jobId === "j6").length === 1, "one live, one voided");
  await h.shot("voided");
};
