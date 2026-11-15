import { describe, expect, it } from "vitest";
import { CLIENT_TABS, clientTabsFor, clientWaiting, isClientTab } from "../src/features/clientRows";

// the client card's view tabs (DS §9 А1п, #1343): the same row for every client of a role; the number — what waits
type R = Parameters<typeof clientWaiting>[0];
const recs = (o: Partial<Record<"estimates" | "invoices" | "jobs" | "tasks", unknown[]>>): R =>
  ({ properties: [], people: [], jobs: [], leads: [], leadIds: [], estimates: [], invoices: [], receipts: [], tasks: [], notes: [], photos: [], files: [], ...o }) as unknown as R;

describe("the row of tabs", () => {
  it("the office: all eight, in the prototype's order", () =>
    expect(clientTabsFor("director")).toEqual(["overview", "estimates", "invoices", "jobs", "tasks", "notes", "files", "history"]));
  it("the tech: no money — no «Счета»; the rest the same", () => expect(clientTabsFor("tech")).toEqual(CLIENT_TABS.filter((x) => x !== "invoices")));
  it("a tab in the address is checked", () => {
    expect(isClientTab("invoices")).toBe(true);
    expect(isClientTab("leads")).toBe(false);
  });
});

describe("the number on a tab: only what waits for an action", () => {
  it("estimates: sent and waiting for the countersign count; draft, approved and declined do not", () =>
    expect(clientWaiting(recs({ estimates: ["draft", "sent", "awaiting_countersign", "approved", "declined"].map((status) => ({ status })) })).estimates).toBe(2));
  it("invoices: not paid in full count; paid and void do not", () =>
    expect(
      clientWaiting(recs({ invoices: [{ totalCents: 1000, paidCents: 0 }, { totalCents: 1000, paidCents: 400 }, { totalCents: 1000, paidCents: 1000 }, { totalCents: 1000, paidCents: 0, status: "void" }] })).invoices,
    ).toBe(2));
  it("jobs: not done count", () => expect(clientWaiting(recs({ jobs: [{ status: "scheduled" }, { status: "in_progress" }, { status: "done" }] })).jobs).toBe(2));
  it("tasks: open count", () => expect(clientWaiting(recs({ tasks: [{}, { doneAt: "2026-11-01" }] })).tasks).toBe(1));
  it("nothing waits — no number at all (not 0)", () => expect(clientWaiting(recs({}))).toEqual({ estimates: undefined, invoices: undefined, jobs: undefined, tasks: undefined }));
});
