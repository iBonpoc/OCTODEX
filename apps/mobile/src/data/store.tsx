/**
 * App store. Two modes, same interface for every screen:
 *  - demo:  local test data (reseeded each day), nothing leaves the device;
 *  - cloud: signed in with a company — data comes from the OCTODEX database (src/cloud/repo.ts),
 *           every change is applied locally at once and sent through a persisted outbox (src/cloud/ops.ts).
 * Every mutation returns `undo` for the 5-second "Undo" toast (DS rule 10). In cloud mode an op is sent
 * only after that window, so Undo simply drops it from the outbox.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Crypto from "expo-crypto";
import { motion } from "@octo/design-tokens";
import { useAuth } from "@/cloud/auth";
import { appRoles, loadCompanyDB } from "@/cloud/repo";
import { applyOp, PermanentError, type Op, type OutboxItem } from "@/cloud/ops";
import { makeSeed } from "./seed";
import { todayKey, usePersistentState } from "./persist";
import {
  VISIT_STEPS,
  type DB,
  type Estimate,
  type Expense,
  type Lead,
  type ID,
  type PaymentMethod,
  type QueuedAction,
  type Role,
  type Visit,
  type VisitStep,
} from "./types";

type Undo = () => void;
export type Mode = "demo" | "cloud";

interface StoreCtx {
  db: DB;
  mode: Mode;
  companyName: string | null;
  role: Role;
  setRole: (r: Role) => void;
  availableRoles: Role[];
  online: boolean;
  setOnline: (v: boolean) => number;
  queue: QueuedAction[];
  syncError: string | null;
  refresh: () => Promise<void>;
  loading: boolean;
  advanceVisit: (id: ID) => Undo;
  addPhoto: (visitId: ID, kind: "before" | "after", uri?: string) => Undo;
  toggleCheck: (visitId: ID, itemId: ID) => Undo;
  signVisit: (visitId: ID, path: string) => Undo;
  payVisit: (visitId: ID, method: PaymentMethod) => Undo;
  replyLead: (id: ID) => Undo;
  bookLead: (id: ID) => Undo;
  assignVisit: (visitId: ID, techId: ID) => Undo;
  resetDemo: () => Undo;
  addLead: (l: Omit<Lead, "id" | "status" | "receivedAt">) => Undo;
  addEstimate: (e: Omit<Estimate, "id">) => Undo;
  sendEstimate: (id: ID) => Undo;
  payInvoice: (id: ID, method: PaymentMethod) => Undo;
  addExpense: (x: Omit<Expense, "id" | "at" | "memberId">) => Undo;
  signEstimate: (id: ID, path: string) => Undo;
  payDeposit: (id: ID, method: PaymentMethod) => Undo;
}

const Ctx = createContext<StoreCtx | null>(null);
/** UUIDs everywhere: the same id is used on the phone and in the database (offline-created rows). */
const uid = (_p?: string) => Crypto.randomUUID();
const emptyDB = (me: string): DB => ({ me, members: [], customers: [], properties: [], jobs: [], visits: [], leads: [], estimates: [], invoices: [], expenses: [] });

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const company = auth.session ? auth.company : null;
  const mode: Mode = company && auth.userId ? "cloud" : "demo";
  const cacheKey = mode === "cloud" ? `octo.cloud.v1.${company!.companyId}` : "octo.db.v1";

  // Demo data is reseeded each new day (dates are relative to "today"). Cloud data is a cache of the server.
  const [saved, setSaved, dbReady] = usePersistentState<{ day: string; db: DB }>(
    cacheKey,
    () => (mode === "cloud" ? { day: "cloud", db: emptyDB(auth.userId ?? "") } : { day: todayKey(), db: makeSeed() }),
    {
      validate: (v) =>
        Array.isArray(v?.db?.visits) && Array.isArray(v?.db?.expenses) && (mode === "cloud" ? v.day === "cloud" : v.day === todayKey()),
    },
  );
  const db = saved.db;
  const setDb = useCallback((next: DB) => setSaved({ day: mode === "cloud" ? "cloud" : todayKey(), db: next }), [setSaved, mode]);
  const [role, setRole, roleReady] = usePersistentState<Role>("octo.role.v1", "tech");
  const [online, setOnlineState] = useState(true);
  const [queue, setQueue, queueReady] = usePersistentState<QueuedAction[]>("octo.queue.v1", []);
  const [outbox, setOutbox, outboxReady] = usePersistentState<OutboxItem[]>("octo.outbox.v1", []);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dbRef = useRef(db);
  dbRef.current = db;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const availableRoles: Role[] = mode === "cloud" ? appRoles(company!.role) : ["tech", "dispatcher", "director"];
  useEffect(() => {
    if (!availableRoles.includes(role)) setRole(availableRoles[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, company?.role]);

  /* ---------- server sync ---------- */
  const refresh = useCallback(async () => {
    if (modeRef.current !== "cloud" || !company || !auth.userId || !onlineRef.current) return;
    if (outboxRef.current.length) return; // send pending changes first, then reload
    setLoading(true);
    try {
      const next = await loadCompanyDB(company.companyId, auth.userId);
      if (!outboxRef.current.length) setDb(next);
      setSyncError(null);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [company, auth.userId, setDb]);

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || modeRef.current !== "cloud" || !company || !auth.userId || !onlineRef.current) return;
    flushing.current = true;
    let sentAny = false;
    try {
      for (;;) {
        const item = outboxRef.current[0];
        if (!item || Date.now() - new Date(item.at).getTime() < motion.toastUndoMs) break;
        try {
          await applyOp(item.op, company.companyId, auth.userId);
          sentAny = true;
          outboxRef.current = outboxRef.current.slice(1);
          setOutbox(outboxRef.current);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setSyncError(msg);
          if (e instanceof PermanentError || item.tries >= 5) {
            // Will never succeed: drop it and reload the truth from the server.
            outboxRef.current = outboxRef.current.slice(1);
          } else {
            outboxRef.current = [{ ...item, tries: item.tries + 1, error: msg }, ...outboxRef.current.slice(1)];
          }
          setOutbox(outboxRef.current);
          break;
        }
      }
    } finally {
      flushing.current = false;
    }
    if (sentAny && !outboxRef.current.length) await refresh();
  }, [company, auth.userId, setOutbox, refresh]);

  useEffect(() => {
    if (mode !== "cloud") return;
    refresh();
    const tick = setInterval(() => {
      if (outboxRef.current.length) flush();
    }, 1500);
    const poll = setInterval(refresh, 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [mode, refresh, flush]);

  /* ---------- mutations ---------- */
  /** Apply locally; in cloud mode record the op; return undo. */
  const mutate = useCallback(
    (label: string, fn: (d: DB) => DB, op?: Op): Undo => {
      const prev = dbRef.current;
      const next = fn(prev);
      dbRef.current = next;
      setDb(next);
      let qid: string | null = null;
      let oid: string | null = null;
      if (modeRef.current === "cloud" && op) {
        oid = uid();
        outboxRef.current = [...outboxRef.current, { id: oid, op, at: new Date().toISOString(), tries: 0 }];
        setOutbox(outboxRef.current);
      } else if (!onlineRef.current) {
        qid = uid();
        setQueue((q) => [...q, { id: qid!, label, at: new Date().toISOString() }]);
      }
      return () => {
        dbRef.current = prev;
        setDb(prev);
        if (qid) setQueue((q) => q.filter((x) => x.id !== qid));
        if (oid) {
          outboxRef.current = outboxRef.current.filter((x) => x.id !== oid);
          setOutbox(outboxRef.current);
        }
      };
    },
    [setDb, setQueue, setOutbox],
  );

  const patchVisit = (d: DB, id: ID, fn: (v: Visit) => Visit): DB => ({
    ...d,
    visits: d.visits.map((v) => (v.id === id ? fn(v) : v)),
  });
  const customerOfJob = (d: DB, jobId: ID) => {
    const job = d.jobs.find((j) => j.id === jobId);
    return d.properties.find((p) => p.id === job?.propertyId)?.customerId ?? "";
  };

  const pendingQueue: QueuedAction[] =
    mode === "cloud" ? outbox.map((o) => ({ id: o.id, label: o.op.k, at: o.at })) : queue;

  const value = useMemo<StoreCtx>(
    () => ({
      db,
      mode,
      companyName: company?.companyName ?? null,
      role,
      setRole,
      availableRoles,
      online,
      queue: pendingQueue,
      syncError,
      refresh,
      loading,
      setOnline: (v) => {
        setOnlineState(v);
        onlineRef.current = v;
        let sent = 0;
        if (v) {
          sent = pendingQueue.length;
          if (mode === "cloud") flush();
          else setQueue([]);
        }
        return sent;
      },
      advanceVisit: (id) => {
        const v = dbRef.current.visits.find((x) => x.id === id);
        const i = v ? VISIT_STEPS.indexOf(v.step) : 0;
        const step: VisitStep = VISIT_STEPS[Math.min(i + 1, VISIT_STEPS.length - 1)]!;
        return mutate(
          "visit.step",
          (d) => patchVisit(d, id, (x) => ({ ...x, step, late: step === "on_site" ? false : x.late })),
          { k: "visit.step", visitId: id, to: step },
        );
      },
      addPhoto: (visitId, kind, uri) => {
        const id = uid();
        const v = dbRef.current.visits.find((x) => x.id === visitId);
        return mutate(
          "photo.add",
          (d) => patchVisit(d, visitId, (x) => ({ ...x, photos: [...x.photos, { id, kind, uri }] })),
          v ? { k: "photo.add", id, visitId, jobId: v.jobId, stage: kind, uri } : undefined,
        );
      },
      toggleCheck: (visitId, itemId) => {
        const v = dbRef.current.visits.find((x) => x.id === visitId);
        const checklist = (v?.checklist ?? []).map((c) => (c.id === itemId ? { ...c, done: !c.done } : c));
        return mutate("check.toggle", (d) => patchVisit(d, visitId, (x) => ({ ...x, checklist })), { k: "visit.checklist", visitId, checklist });
      },
      signVisit: (visitId, path) =>
        mutate("visit.sign", (d) => patchVisit(d, visitId, (v) => ({ ...v, signature: path, step: "signed" })), { k: "visit.sign", visitId, svg: path }),
      payVisit: (visitId, method) => {
        const d0 = dbRef.current;
        const v = d0.visits.find((x) => x.id === visitId);
        if (!v) return () => {};
        const invoiceId = uid();
        const paymentId = uid();
        const customerId = customerOfJob(d0, v.jobId);
        const now = new Date().toISOString();
        return mutate(
          "visit.pay",
          (d) => {
            const next = patchVisit(d, visitId, (x) => ({ ...x, step: "paid", payment: { method, amountCents: x.amountDueCents, at: now } }));
            return {
              ...next,
              jobs: next.jobs.map((j) => (j.id === v.jobId ? { ...j, status: "done" } : j)),
              invoices: customerId
                ? [
                    ...next.invoices,
                    { id: invoiceId, customerId, jobId: v.jobId, totalCents: v.amountDueCents, paidCents: v.amountDueCents, dueDate: now, paidAt: now, method, kind: "final" },
                  ]
                : next.invoices,
            };
          },
          v.amountDueCents > 0 && customerId
            ? { k: "visit.pay", visitId, jobId: v.jobId, customerId, invoiceId, paymentId, amountCents: v.amountDueCents, method }
            : undefined,
        );
      },
      replyLead: (id) =>
        mutate("lead.reply", (d) => ({ ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, status: "replied" } : l)) }), { k: "lead.reply", leadId: id }),
      bookLead: (id) => {
        const l = dbRef.current.leads.find((x) => x.id === id);
        if (!l) return () => {};
        // Lead → customer → property → job "Estimate visit" → unassigned visit tomorrow 10:00 (dispatcher assigns).
        const ids = { customerId: uid(), contactId: uid(), propertyId: uid(), jobId: uid(), visitId: uid() };
        const start = new Date();
        start.setDate(start.getDate() + 1);
        start.setHours(10, 0, 0, 0);
        return mutate(
          "lead.book",
          (d) => ({
            ...d,
            leads: d.leads.map((x) => (x.id === id ? { ...x, status: "booked" } : x)),
            customers: [...d.customers, { id: ids.customerId, name: l.name, phone: l.phone, source: l.source, balanceCents: 0 }],
            properties: [...d.properties, { id: ids.propertyId, customerId: ids.customerId, address: l.address ?? "", city: l.city, stories: 1 }],
            jobs: [...d.jobs, { id: ids.jobId, propertyId: ids.propertyId, title: "Estimate visit", status: "estimate", amountCents: 0 }],
            visits: [
              ...d.visits,
              {
                id: ids.visitId, jobId: ids.jobId, techId: null, start: start.toISOString(), durationMin: 45, step: "scheduled",
                scope: l.message ? [l.message] : [], checklist: [], photos: [], amountDueCents: 0,
              },
            ],
          }),
          {
            k: "lead.book", leadId: id, ...ids, name: l.name, phone: l.phone, source: l.source, address: l.address ?? "", city: l.city,
            message: l.message, start: start.toISOString(),
          },
        );
      },
      addLead: (lead) => {
        const id = uid();
        return mutate(
          "lead.add",
          (d) => ({ ...d, leads: [{ ...lead, id, status: "new", receivedAt: new Date().toISOString() }, ...d.leads] }),
          { k: "lead.add", id, name: lead.name, phone: lead.phone, city: lead.city, address: lead.address, source: lead.source, message: lead.message },
        );
      },
      assignVisit: (visitId, techId) =>
        mutate("visit.assign", (d) => patchVisit(d, visitId, (v) => ({ ...v, techId })), { k: "visit.assign", visitId, userId: techId }),
      addEstimate: (e) => {
        const id = uid();
        return mutate("estimate.add", (d) => ({ ...d, estimates: [...d.estimates, { ...e, id }] }), {
          k: "estimate.add", id, versionId: uid(), optionId: uid(), customerId: e.customerId, propertyId: e.propertyId, title: e.title,
          totalCents: e.totalCents, depositCents: e.depositCents, marginPct: e.marginPct ?? null, lines: e.lines ?? [],
        });
      },
      addExpense: (x) => {
        const id = uid();
        return mutate(
          "expense.add",
          (d) => ({ ...d, expenses: [{ ...x, id, at: new Date().toISOString(), memberId: d.me }, ...(d.expenses ?? [])] }),
          { k: "expense.add", id, jobId: x.jobId, vendor: x.vendor, category: x.category, amountCents: x.amountCents },
        );
      },
      payInvoice: (id, method) => {
        const inv = dbRef.current.invoices.find((i) => i.id === id);
        return mutate(
          "invoice.pay",
          (d) => ({
            ...d,
            invoices: d.invoices.map((i) => (i.id === id ? { ...i, paidCents: i.totalCents, paidAt: new Date().toISOString(), method } : i)),
          }),
          inv ? { k: "invoice.pay", invoiceId: id, paymentId: uid(), customerId: inv.customerId, amountCents: inv.totalCents - inv.paidCents, method } : undefined,
        );
      },
      sendEstimate: (id) =>
        mutate(
          "estimate.send",
          (d) => ({ ...d, estimates: d.estimates.map((e) => (e.id === id ? { ...e, status: "sent", sentAt: new Date().toISOString() } : e)) }),
          { k: "estimate.send", id },
        ),
      signEstimate: (id, path) =>
        mutate(
          "estimate.sign",
          (d) => ({
            ...d,
            estimates: d.estimates.map((e) =>
              e.id === id ? { ...e, status: "approved", signature: path, approvedAt: new Date().toISOString(), sentAt: e.sentAt ?? new Date().toISOString() } : e,
            ),
          }),
          { k: "estimate.sign", id, svg: path },
        ),
      payDeposit: (id, method) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e || !e.depositCents) return () => {};
        const now = new Date().toISOString();
        const jobId = uid();
        const invoiceId = uid();
        return mutate(
          "estimate.deposit",
          (d) => ({
            ...d,
            estimates: d.estimates.map((x) => (x.id === id ? { ...x, depositPaidAt: now } : x)),
            jobs: [...d.jobs, { id: jobId, propertyId: e.propertyId, title: e.title, status: "scheduled", amountCents: e.totalCents }],
            invoices: [
              ...d.invoices,
              { id: invoiceId, customerId: e.customerId, jobId, totalCents: e.depositCents!, paidCents: e.depositCents!, dueDate: now, paidAt: now, method, kind: "deposit" },
            ],
          }),
          {
            k: "estimate.deposit", id, jobId, invoiceId, paymentId: uid(), method, customerId: e.customerId, propertyId: e.propertyId,
            title: e.title, totalCents: e.totalCents, depositCents: e.depositCents,
          },
        );
      },
      resetDemo: () => (mode === "demo" ? mutate("demo.reset", () => makeSeed()) : () => {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, mode, company, role, online, pendingQueue.length, syncError, loading, mutate, setRole, setQueue, refresh, flush],
  );

  if (!auth.ready || !dbReady || !roleReady || !queueReady || !outboxReady) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}

export { isToday, visitContext, minutesSince, daysSince, customerBalance, jobProfit } from "./selectors";
