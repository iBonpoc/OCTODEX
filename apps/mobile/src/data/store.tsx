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
import { clientDoc, newToken, summarize } from "@/features/estimateDoc";
import { todayKey, usePersistentState } from "./persist";
import {
  VISIT_STEPS,
  type CatalogItem,
  type Company,
  type CompanyContact,
  type CompanyLicense,
  type DB,
  type Estimate,
  type EstimateApproval,
  type EstimateDoc,
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
  sendEstimate: (id: ID, token?: string) => Undo;
  payInvoice: (id: ID, method: PaymentMethod) => Undo;
  addExpense: (x: Omit<Expense, "id" | "at" | "memberId">) => Undo;
  signEstimate: (id: ID, path: string) => Undo;
  /** fromClient: paid on the client page → unread notice for the office */
  payDeposit: (id: ID, method: PaymentMethod, fromClient?: boolean) => Undo;
  /** create or update a universal estimate (draft) */
  saveEstimate: (e: { id: ID; customerId: ID; propertyId: ID; title: string; doc: EstimateDoc }) => Undo;
  /** client's choice + signature (on site or on the client page): job + visit in the plan + notice */
  approveEstimate: (id: ID, a: Omit<EstimateApproval, "at" | "totalCents" | "depositCents">) => Undo;
  saveCatalogItem: (it: CatalogItem) => Undo;
  removeCatalogItem: (id: ID) => Undo;
  readNotices: () => void;
  /** company profile (owner/admin in the cloud) */
  saveCompany: (patch: Partial<Omit<Company, "id" | "licenses" | "contacts">>) => Undo;
  saveLicense: (l: CompanyLicense) => Undo;
  removeLicense: (id: ID) => Undo;
  saveContact: (c: CompanyContact) => Undo;
  removeContact: (id: ID) => Undo;
  /** contractor picks date, time, duration and (optionally) the tech → a visit appears in the plan */
  scheduleJob: (jobId: ID, s: { start: string; durationMin: number; techId: ID | null }) => Undo;
}

const Ctx = createContext<StoreCtx | null>(null);
/** UUIDs everywhere: the same id is used on the phone and in the database (offline-created rows). */
const uid = (_p?: string) => Crypto.randomUUID();
const emptyDB = (me: string): DB => ({
  me, members: [], customers: [], properties: [], jobs: [], visits: [], leads: [], estimates: [], invoices: [], expenses: [], catalog: [], notices: [],
  company: null, notes: [],
});
const upsert = <T extends { id: string }>(list: T[], it: T): T[] => (list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [...list, it]);
/** Older saved data has no catalog / notices yet. */
const normalize = (d: DB): DB =>
  d.catalog && d.notices && d.notes && d.company !== undefined
    ? d
    : { ...d, catalog: d.catalog ?? [], notices: d.notices ?? [], notes: d.notes ?? [], company: d.company ?? null };
/** Fresh ids for options/lines when a sent estimate is edited (the sent version stays immutable in the database). */
const reId = (doc: EstimateDoc): EstimateDoc => ({
  ...doc,
  options: doc.options.map((o) => ({ ...o, id: uid(), lines: o.lines.map((l) => ({ ...l, id: uid() })) })),
});
const costsOf = (doc: EstimateDoc): Record<string, number> =>
  Object.fromEntries(doc.options.flatMap((o) => o.lines.filter((l) => l.unitCostCents !== undefined).map((l) => [l.id, l.unitCostCents!])));

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const company = auth.session ? auth.company : null;
  const mode: Mode = company && auth.userId ? "cloud" : "demo";
  const cacheKey = mode === "cloud" ? `octo.cloud.v1.${company!.companyId}` : "octo.db.v3";

  // Demo data is reseeded each new day (dates are relative to "today"). Cloud data is a cache of the server.
  const [saved, setSaved, dbReady] = usePersistentState<{ day: string; db: DB }>(
    cacheKey,
    () => (mode === "cloud" ? { day: "cloud", db: emptyDB(auth.userId ?? "") } : { day: todayKey(), db: makeSeed() }),
    {
      validate: (v) =>
        Array.isArray(v?.db?.visits) && Array.isArray(v?.db?.expenses) && (mode === "cloud" ? v.day === "cloud" : v.day === todayKey()),
    },
  );
  const db = useMemo(() => normalize(saved.db), [saved.db]);
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
      sendEstimate: (id, tk) => {
        const token = dbRef.current.estimates.find((e) => e.id === id)?.token ?? tk ?? newToken();
        return mutate(
          "estimate.send",
          (d) => ({
            ...d,
            estimates: d.estimates.map((e) => (e.id === id ? { ...e, token, status: e.status === "draft" ? "sent" : e.status, sentAt: e.sentAt ?? new Date().toISOString() } : e)),
          }),
          { k: "estimate.send", id, token },
        );
      },
      saveEstimate: ({ id, customerId, propertyId, title, doc: doc0 }) => {
        const prev = dbRef.current.estimates.find((e) => e.id === id);
        if (prev?.status === "approved") return () => {};
        const doc = prev && prev.status !== "draft" ? reId(doc0) : doc0;
        const sum = summarize(doc);
        const versionId = uid();
        return mutate(
          "estimate.save",
          (d) => {
            const next: Estimate = {
              ...(prev ?? {}),
              id, customerId, propertyId, title, doc, status: "draft", ...sum,
              sentAt: prev?.status === "draft" ? prev.sentAt : undefined,
            };
            return { ...d, estimates: prev ? d.estimates.map((e) => (e.id === id ? next : e)) : [...d.estimates, next] };
          },
          { k: "estimate.save", id, versionId, customerId, propertyId, title, doc: clientDoc(doc), costs: costsOf(doc), totalCents: sum.totalCents, depositCents: sum.depositCents, marginPct: sum.marginPct },
        );
      },
      approveEstimate: (id, a) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e?.doc || e.status === "approved") return () => {};
        const token = e.token ?? newToken();
        const now = new Date().toISOString();
        const sum = summarize(e.doc, a);
        const approval: EstimateApproval = { ...a, at: now, totalCents: sum.totalCents, depositCents: sum.depositCents };
        const existingJob = dbRef.current.jobs.find((j) => j.estimateId === id);
        const jobId = existingJob?.id ?? uid();
        const customer = dbRef.current.customers.find((c) => c.id === e.customerId);
        return mutate(
          "estimate.approve",
          (d) => ({
            ...d,
            estimates: d.estimates.map((x) =>
              x.id === id
                ? { ...x, ...sum, token, status: "approved", approval, signature: a.signature, approvedAt: now, sentAt: x.sentAt ?? now }
                : x,
            ),
            jobs: existingJob
              ? d.jobs
              : [...d.jobs, { id: jobId, propertyId: e.propertyId, title: e.title, status: "unscheduled", amountCents: sum.totalCents, estimateId: id }],
            notices: [
              { id: uid(), kind: "estimate.approved", estimateId: id, jobId, customer: customer?.name ?? a.signerName, totalCents: sum.totalCents, depositCents: sum.depositCents, at: now, read: a.channel === "on_site" },
              ...d.notices,
            ],
          }),
          { k: "estimate.approve", id, token, optionId: a.optionId, addonIds: a.addonIds, signer: a.signerName, svg: a.signature, channel: a.channel, jobId },
        );
      },
      saveCatalogItem: (it) =>
        mutate(
          "catalog.save",
          (d) => ({ ...d, catalog: d.catalog.some((x) => x.id === it.id) ? d.catalog.map((x) => (x.id === it.id ? it : x)) : [...d.catalog, it] }),
          { k: "catalog.save", item: it },
        ),
      removeCatalogItem: (id) => mutate("catalog.remove", (d) => ({ ...d, catalog: d.catalog.filter((x) => x.id !== id) }), { k: "catalog.remove", id }),
      scheduleJob: (jobId, sch) => {
        const d0 = dbRef.current;
        const job = d0.jobs.find((j) => j.id === jobId);
        if (!job) return () => {};
        const e = job.estimateId ? d0.estimates.find((x) => x.id === job.estimateId) : undefined;
        const visitId = uid();
        const opt = e?.doc && e.approval ? e.doc.options.find((o) => o.id === e.approval!.optionId) : undefined;
        const scope = opt ? opt.lines.filter((l) => l.name.trim() && (!l.optional || e!.approval!.addonIds.includes(l.id))).map((l) => l.name) : [job.title];
        const paidDeposit = e?.depositPaidAt ? e.depositCents ?? 0 : 0;
        const due = Math.max(0, job.amountCents - paidDeposit);
        const end = new Date(new Date(sch.start).getTime() + sch.durationMin * 60_000).toISOString();
        return mutate(
          "job.schedule",
          (d) => ({
            ...d,
            jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status: "scheduled" } : j)),
            visits: [
              ...d.visits,
              { id: visitId, jobId, techId: sch.techId, start: sch.start, durationMin: sch.durationMin, step: "scheduled", scope, checklist: [], photos: [], amountDueCents: due },
            ],
            notices: d.notices.map((n) => (n.jobId === jobId ? { ...n, read: true } : n)),
          }),
          { k: "job.schedule", jobId, visitId, start: sch.start, end, techId: sch.techId, scope },
        );
      },
      saveCompany: (patch) => {
        const cur = dbRef.current.company;
        if (!cur) return () => {};
        const next = { ...cur, ...patch };
        return mutate("company.save", (d) => ({ ...d, company: next }), { k: "company.save", company: next, einChanged: patch.ein !== undefined });
      },
      saveLicense: (l) =>
        mutate(
          "license.save",
          (d) => (d.company ? { ...d, company: { ...d.company, licenses: upsert(d.company.licenses, l) } } : d),
          { k: "license.save", license: l },
        ),
      removeLicense: (id) =>
        mutate(
          "license.remove",
          (d) => (d.company ? { ...d, company: { ...d.company, licenses: d.company.licenses.filter((x) => x.id !== id) } } : d),
          { k: "license.remove", id },
        ),
      saveContact: (c) =>
        mutate(
          "contact.save",
          (d) =>
            d.company
              ? {
                  ...d,
                  company: {
                    ...d.company,
                    contacts: upsert(d.company.contacts.map((x) => (c.isPrimary && x.id !== c.id ? { ...x, isPrimary: false } : x)), c),
                  },
                }
              : d,
          { k: "contact.save", contact: c },
        ),
      removeContact: (id) =>
        mutate(
          "contact.remove",
          (d) => (d.company ? { ...d, company: { ...d.company, contacts: d.company.contacts.filter((x) => x.id !== id) } } : d),
          { k: "contact.remove", id },
        ),
      readNotices: () => {
        const ids = dbRef.current.notices.filter((n) => !n.read).map((n) => n.id);
        if (!ids.length) return;
        mutate("notice.read", (d) => ({ ...d, notices: d.notices.map((n) => ({ ...n, read: true })) }), { k: "notice.read", ids });
      },
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
      payDeposit: (id, method, fromClient) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e || !e.depositCents) return () => {};
        const now = new Date().toISOString();
        const existingJob = dbRef.current.jobs.find((j) => j.estimateId === id);
        const jobId = existingJob?.id ?? uid();
        const invoiceId = uid();
        return mutate(
          "estimate.deposit",
          (d) => ({
            ...d,
            estimates: d.estimates.map((x) => (x.id === id ? { ...x, depositPaidAt: now } : x)),
            notices: [
              { id: uid(), kind: "deposit.paid", estimateId: id, customer: d.customers.find((c) => c.id === e.customerId)?.name ?? "", depositCents: e.depositCents, at: now, read: !fromClient },
              ...d.notices,
            ],
            jobs: existingJob ? d.jobs : [...d.jobs, { id: jobId, propertyId: e.propertyId, title: e.title, status: "unscheduled", amountCents: e.totalCents, estimateId: id }],
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
