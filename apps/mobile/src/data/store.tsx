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
import { leadCols, type LeadPatch } from "@/cloud/leadCols";
import { leadStatusToDb } from "@/cloud/statusMap";

/** app lead status → public.leads.status */
const dbStatus = (s: LeadStatus): string => leadStatusToDb[s];
import { makeSeed } from "./seed";
import { normalizeDB } from "./normalize";
import { cleanPeople, leadPeopleOf, mainContact, nextClientNumber } from "./people";
import { cityLine, splitGateCodes, withGateCodes } from "@/features/properties";
import { clientDoc, newToken, summarize } from "@/features/estimateDoc";
import { canCountersign, canManageLink, clientSigned, companySigned, validUntilFor } from "@/features/estimateSign";
import { acceptPayment } from "@octo/estimating-engine";
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
  type LostReason,
  type Note,
  type Payment,
  type ID,
  type PaymentMethod,
  type QueuedAction,
  type Role,
  type Visit,
  type VisitStep,
  type Task,
  type Source,
  type LeadStatus,
  type CallOutcome,
  type LeadInterest,
  type CustomerStatus,
  type Person,
  type Property,
  type Tag,
} from "./types";

type Undo = () => void;
export type Mode = "demo" | "cloud";
/** when and who for an estimate visit */
export interface BookAt {
  start: string;
  durationMin: number;
  techId: ID | null;
  note?: string;
}
const isOpenLeadStatus = (s: LeadStatus) => s !== "won" && s !== "lost" && s !== "declined";

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
  removePhoto: (visitId: ID, photoId: ID) => Undo;
  /** extra checklist item added on site by the tech */
  addCheckItem: (visitId: ID, label: string) => Undo;
  signVisit: (visitId: ID, path: string) => Undo;
  payVisit: (visitId: ID, method: PaymentMethod) => Undo;
  /** "I replied" (no call/SMS from the app): stops the reply timer */
  replyLead: (id: ID) => Undo;
  /** call / SMS / email / marketplace from the card: history line + first response + new → in touch */
  touchLead: (id: ID, kind: "call" | "sms" | "email" | "marketplace" | "reply") => Undo;
  /** after a call from the card: answered = in touch; no answer / voicemail = one more attempt, the reply timer keeps going */
  callResult: (id: ID, outcome: CallOutcome) => Undo;
  setLeadInterest: (id: ID, interest: LeadInterest | undefined) => Undo;
  /** "call me in 3 months": hidden until the date, keeps its funnel status */
  snoozeLead: (id: ID, until: string, reason?: string) => Undo;
  unsnoozeLead: (id: ID) => Undo;
  /** a reminder went to the client: starts the "lost or wait?" countdown */
  markReminded: (id: ID) => Undo;
  /** answer "wait" to "lost or wait?": ask again in N days */
  waitMore: (id: ID, days: number) => Undo;
  updateLead: (id: ID, patch: LeadPatch) => Undo;
  /** lost = the client decided, declined = we decided; reason required ("other" needs text) */
  closeLead: (id: ID, close: "lost" | "declined", reason: LostReason, text?: string) => Undo;
  reopenLead: (id: ID) => Undo;
  assignLead: (id: ID, memberId: ID) => Undo;
  setLeadCost: (id: ID, cents: number) => Undo;
  /** all people of a lead in one save (the first is the lead itself); once the lead has a client, its people are the client's */
  saveLeadPeople: (leadId: ID, people: Person[]) => Undo;
  saveTask: (t: Omit<Task, "id"> & { id?: ID }) => { id: ID; undo: Undo };
  /** company lead sources: add / edit / hide (sources with leads are never deleted) */
  saveSource: (s: Omit<Source, "id"> & { id?: ID }) => { id: ID; undo: Undo };
  /**
   * Estimate visit for a lead: the date, time, length and tech the person picked (docs/14 §7.3; no "tomorrow 10:00").
   * Reuses the lead's client and property if it already has them (no second client); otherwise makes a prospect first.
   */
  bookLead: (id: ID, at: BookAt) => Undo;
  assignVisit: (visitId: ID, techId: ID) => Undo;
  resetDemo: () => Undo;
  addLead: (l: Omit<Lead, "id" | "status" | "receivedAt">) => { id: ID; undo: Undo };
  addEstimate: (e: Omit<Estimate, "id">) => Undo;
  sendEstimate: (id: ID, token?: string) => Undo;
  payInvoice: (id: ID, method: PaymentMethod) => Undo;
  addExpense: (x: Omit<Expense, "id" | "at" | "memberId">) => Undo;
  signEstimate: (id: ID, path: string) => Undo;
  /** fromClient: paid on the client page → unread notice for the office */
  payDeposit: (id: ID, method: PaymentMethod, fromClient?: boolean) => Undo;
  /** any amount up to the invoice balance; every payment is a receipt */
  recordPayment: (invoiceId: ID, amountCents: number, method: PaymentMethod, reference?: string, fromClient?: boolean) => Undo;
  /** progress (by stage) or final balance invoice for a job */
  issueInvoice: (jobId: ID, kind: "progress" | "final", amountCents: number, title: string) => Undo;
  /** create or update a universal estimate (draft) */
  saveEstimate: (e: { id: ID; customerId: ID; propertyId: ID; title: string; doc: EstimateDoc; leadId?: ID }) => Undo;
  /** client + property for an estimate from a lead (creates a prospect card the first time) */
  leadEstimateTarget: (leadId: ID) => { customerId: ID; propertyId: ID; undo: Undo } | null;
  /** manual "make a client" with a reason (paper contract, verbal, paid…) */
  convertLead: (leadId: ID, reasonText: string) => Undo;
  /** New client entered by hand (not from a lead): active client with one property. */
  addCustomer: (c: { name: string; phone: string; email?: string; sourceId: ID; address: string; city: string }) => { id: ID; undo: Undo };
  updateCustomer: (id: ID, patch: { name?: string; phone?: string; email?: string }) => Undo;
  /** people of a client (several phones / emails each); the first person is the main one */
  saveCustomerPeople: (id: ID, people: Person[]) => Undo;
  setCustomerTags: (id: ID, tagIds: ID[]) => Undo;
  setCustomerStatus: (id: ID, status: CustomerStatus, reason?: string) => Undo;
  /** add or edit a company tag (hiding = active: false; a tag is never deleted) */
  saveTag: (t: Omit<Tag, "id" | "position"> & { id?: ID; position?: number }) => { id: ID; undo: Undo };
  updateProperty: (id: ID, patch: { address?: string; city?: string }) => Undo;
  /** C2: a property of a client, new or edited (everything but the gate code) */
  saveProperty: (p: Property) => Undo;
  /** C2: the gate code (office only; the server refuses others) */
  setGateCode: (propertyId: ID, code: string) => Undo;
  addNote: (n: Omit<Note, "id" | "at" | "authorId" | "pinned">) => Undo;
  updateNote: (id: ID, patch: { pinned?: boolean; body?: string; deleted?: boolean }) => Undo;
  /** client's choice + signature (on site or on the client page) → awaiting the company's signature (S8, docs/specs/07 §4) */
  approveEstimate: (id: ID, a: Omit<EstimateApproval, "at" | "totalCents" | "depositCents">) => Undo;
  /* ---- wave E2a: the company signs (docs/specs/07 §2.2 А) ---- */
  /** an employee signs for the company in their own name (S8b): approved, lead won, client active, job, deposit invoice */
  countersignEstimate: (id: ID, signature: string) => Undo;
  /** director / office: the client link stops working; the next send makes a new one */
  revokeEstimateLink: (id: ID) => Undo;
  saveCatalogItem: (it: CatalogItem) => Undo;
  removeCatalogItem: (id: ID) => Undo;
  readNotices: () => void;
  /** invite a person (demo: added as pending; cloud: email invites come with the email service) */
  inviteMember: (m: { name: string; email?: string; phone?: string; roles: Role[]; kind: "employee" | "sub" }) => Undo;
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
  me, members: [], sources: [], tags: [], tasks: [], activities: [], customers: [], properties: [], jobs: [], visits: [], leads: [], estimates: [], invoices: [], expenses: [], catalog: [], notices: [],
  company: null, notes: [], payments: [],
});
const upsert = <T extends { id: string }>(list: T[], it: T): T[] => (list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [...list, it]);
/** Next local receipt number (demo); in the cloud the server assigns RCT-… */
const nextReceipt = (d: DB): string => {
  const max = d.payments.reduce((m, p) => Math.max(m, Number(p.receiptNumber?.replace(/\D/g, "") ?? 0)), 100);
  return `RCT-${String(max + 1).padStart(4, "0")}`;
};
const nextInvoiceNumber = (d: DB): string => {
  const max = d.invoices.reduce((m, i) => Math.max(m, Number(i.number?.replace(/\D/g, "") ?? 0)), 100);
  return `INV-${String(max + 1).padStart(4, "0")}`;
};
/** Add a payment to the data and update the invoice (paid, paidAt). */
function withPayment(d: DB, p: Payment, demo: boolean): DB {
  const pay = demo ? { ...p, receiptNumber: p.receiptNumber ?? nextReceipt(d) } : p;
  return {
    ...d,
    payments: [pay, ...d.payments],
    invoices: d.invoices.map((i) =>
      i.id === p.invoiceId
        ? { ...i, paidCents: i.paidCents + p.amountCents, method: p.method, paidAt: i.paidCents + p.amountCents >= i.totalCents ? p.at : i.paidAt }
        : i,
    ),
  };
}
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
  const cacheKey = mode === "cloud" ? `octo.cloud.v1.${company!.companyId}` : "octo.db.v5";

  // Demo data is reseeded each new day (dates are relative to "today"). Cloud data is a cache of the server.
  const [saved, setSaved, dbReady] = usePersistentState<{ day: string; db: DB }>(
    cacheKey,
    () => (mode === "cloud" ? { day: "cloud", db: emptyDB(auth.userId ?? "") } : { day: todayKey(), db: makeSeed() }),
    {
      validate: (v) =>
        Array.isArray(v?.db?.visits) && Array.isArray(v?.db?.expenses) && (mode === "cloud" ? v.day === "cloud" : v.day === todayKey()),
    },
  );
  // gate codes (C2) stay in memory in the cloud: never written to the cache on the phone (security review of #62)
  const [gateCodes, setGateCodes] = useState<Record<string, string>>({});
  const db = useMemo(() => {
    const d = normalizeDB(saved.db, mode);
    return mode === "cloud" ? withGateCodes(d, gateCodes) : d;
  }, [saved.db, mode, gateCodes]);
  const setDb = useCallback(
    (next: DB) => {
      if (mode !== "cloud") return setSaved({ day: todayKey(), db: next });
      const { db: bare, codes } = splitGateCodes(next);
      setGateCodes(codes);
      setSaved({ day: "cloud", db: bare });
    },
    [setSaved, mode],
  );
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
    let dropped = false;
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
            dropped = true;
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
    // a dropped op left the phone ahead of the server: reload the truth
    if ((sentAny && !outboxRef.current.length) || dropped) await refresh();
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

  /** Payment on an invoice (capped at its balance by the engine). Deposit invoice paid → estimate deposit paid. */
  const recordPayment = (invoiceId: ID, amountCents: number, method: PaymentMethod, reference?: string, fromClient?: boolean): Undo => {
    const d0 = dbRef.current;
    const inv = d0.invoices.find((i) => i.id === invoiceId);
    if (!inv) return () => {};
    const amount = acceptPayment(inv, amountCents);
    if (amount <= 0) return () => {};
    const now = new Date().toISOString();
    const payment: Payment = { id: uid(), invoiceId, customerId: inv.customerId, amountCents: amount, method, at: now, reference: reference?.trim() || undefined };
    const job = d0.jobs.find((j) => j.id === inv.jobId);
    const est = inv.kind === "deposit" && job?.estimateId ? d0.estimates.find((e) => e.id === job.estimateId) : undefined;
    const fullyPaid = inv.paidCents + amount >= inv.totalCents;
    return mutate(
      "payment.record",
      (d) => {
        let next = withPayment(d, payment, modeRef.current === "demo");
        if (fromClient && !est) {
          next = {
            ...next,
            notices: [
              { id: uid(), kind: "invoice.paid", customer: d.customers.find((c) => c.id === inv.customerId)?.name ?? "", depositCents: amount, totalCents: amount, at: now },
              ...next.notices,
            ],
          };
        }
        if (est && fullyPaid) {
          next = {
            ...next,
            estimates: next.estimates.map((e) => (e.id === est.id ? { ...e, depositPaidAt: now } : e)),
            notices: [
              { id: uid(), kind: "deposit.paid", estimateId: est.id, customer: d.customers.find((c) => c.id === est.customerId)?.name ?? "", depositCents: inv.totalCents, at: now, read: !fromClient },
              ...next.notices,
            ],
          };
        }
        return next;
      },
      { k: "payment.record", id: payment.id, invoiceId, customerId: inv.customerId, amountCents: amount, method, reference: payment.reference },
    );
  };

  const pendingQueue: QueuedAction[] =
    mode === "cloud" ? outbox.map((o) => ({ id: o.id, label: o.op.k, at: o.at })) : queue;

  const touchLead = (id: ID, kind: "call" | "sms" | "email" | "marketplace" | "reply", outcome?: CallOutcome): Undo => {
    const activityId = uid();
    const at = new Date().toISOString();
    const missed = kind === "call" && (outcome === "no_answer" || outcome === "voicemail");
    return mutate(
      "lead.touch",
      (d) => {
        const l = d.leads.find((x) => x.id === id);
        const toReplied = l?.status === "new" && !missed;
        return {
          ...d,
          leads: d.leads.map((x) =>
            x.id !== id ? x
            : missed ? { ...x, callAttempts: (x.callAttempts ?? 0) + 1, lastOutboundAt: at, lastActivityAt: at }
            : { ...x, firstResponseAt: x.firstResponseAt ?? at, status: toReplied ? "replied" : x.status, callAttempts: 0, lastOutboundAt: at, lastActivityAt: at },
          ),
          activities: [
            { id: activityId, subjectType: "lead", subjectId: id, kind, at, actorId: d.me, ...(outcome ? { meta: { outcome } } : {}) },
            ...(toReplied ? [{ id: uid(), subjectType: "lead" as const, subjectId: id, kind: "status" as const, meta: { from: "new", to: "replied" }, at, actorId: d.me }] : []),
            ...d.activities,
          ],
        };
      },
      { k: "lead.touch", activityId, leadId: id, kind, at, ...(outcome ? { outcome } : {}) },
    );
  };

  /** The lead's client and property; makes a prospect client + property the first time (S3). */
  const leadTarget = (leadId: ID): { customerId: ID; propertyId: ID; undo: Undo } | null => {
    const d0 = dbRef.current;
    const l = d0.leads.find((x) => x.id === leadId);
    if (!l) return null;
    if (l.customerId) {
      const propertyId = l.propertyId ?? d0.properties.find((p) => p.customerId === l.customerId)?.id;
      if (propertyId) return { customerId: l.customerId, propertyId, undo: () => {} };
    }
    const ids = { customerId: uid(), contactId: uid(), propertyId: uid() };
    const now = new Date().toISOString();
    const undo = mutate(
      "lead.prospect",
      (d) => ({
        ...d,
        // the lead's people become the client's (S3; the server moves them the same way, app.move_lead_people)
        customers: [...d.customers, { id: ids.customerId, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, balanceCents: 0, status: "prospect", people: clientPeopleFromLead(l, ids.contactId) }],
        properties: [...d.properties, { id: ids.propertyId, customerId: ids.customerId, address: l.address ?? "", city: l.city, stories: 1 }],
        leads: d.leads.map((x) => (x.id === leadId ? { ...x, customerId: ids.customerId, propertyId: ids.propertyId, lastActivityAt: now } : x)),
      }),
      { k: "lead.prospect", leadId, ...ids, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, address: l.address ?? "", city: l.city },
    );
    return { customerId: ids.customerId, propertyId: ids.propertyId, undo };
  };

  /** all people of a client in one save (one RPC on the server) */
  const saveCustomerPeople = (id: ID, people: Person[]): Undo => {
    const clean = cleanPeople(people, uid);
    const main = clean[0];
    const phone = main?.phones.find((p) => p.primary)?.number ?? main?.phones[0]?.number ?? "";
    const email = main?.emails.find((e) => e.primary)?.address ?? main?.emails[0]?.address;
    return mutate(
      "customer.people",
      (d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, people: clean, phone, email } : c)) }),
      { k: "customer.people", id, people: clean },
    );
  };

  /** a lead's people for its new client: the main person is the client's main contact (the server merges them, same id) */
  const clientPeopleFromLead = (l: Lead, contactId: ID): Person[] => cleanPeople(leadPeopleOf(l), uid).map((p, i) => (i === 0 ? { ...p, id: contactId } : p));

  /** a plain field change on a lead (same path as "edit lead") */
  const patchLead = (id: ID, patch: LeadPatch): Undo => {
    const l0 = dbRef.current.leads.find((x) => x.id === id);
    return mutate(
      "lead.update",
      (d) => ({ ...d, leads: d.leads.map((x) => (x.id === id ? { ...x, ...patch, lastActivityAt: new Date().toISOString() } : x)) }),
      { k: "lead.update", id, cols: leadCols(patch, l0) },
    );
  };

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
      removePhoto: (visitId, photoId) =>
        mutate("photo.remove", (d) => patchVisit(d, visitId, (x) => ({ ...x, photos: x.photos.filter((p) => p.id !== photoId) })), { k: "photo.remove", id: photoId }),
      addCheckItem: (visitId, label) => {
        const v = dbRef.current.visits.find((x) => x.id === visitId);
        const checklist = [...(v?.checklist ?? []), { id: uid(), label, done: false }];
        return mutate("check.add", (d) => patchVisit(d, visitId, (x) => ({ ...x, checklist })), { k: "visit.checklist", visitId, checklist });
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
      replyLead: (id) => touchLead(id, "reply"),
      touchLead: (id, kind) => touchLead(id, kind),
      callResult: (id, outcome) => touchLead(id, "call", outcome),
      setLeadInterest: (id, interest) => patchLead(id, { interest }),
      snoozeLead: (id, until, reason) => patchLead(id, { snoozedUntil: until, snoozeReason: reason?.trim() || undefined }),
      unsnoozeLead: (id) => patchLead(id, { snoozedUntil: undefined, snoozeReason: undefined }),
      markReminded: (id) => patchLead(id, { remindedAt: new Date().toISOString(), askAgainAt: undefined }),
      waitMore: (id, days) => patchLead(id, { askAgainAt: new Date(Date.now() + days * 86_400_000).toISOString() }),
      updateLead: (id, patch) => {
        const l0 = dbRef.current.leads.find((x) => x.id === id);
        return mutate(
          "lead.update",
          (d) => ({ ...d, leads: d.leads.map((x) => (x.id === id ? { ...x, ...patch, lastActivityAt: new Date().toISOString() } : x)) }),
          { k: "lead.update", id, cols: leadCols(patch, l0) },
        );
      },
      closeLead: (id, close, reason, text) => {
        const activityId = uid();
        const at = new Date().toISOString();
        const from = dbRef.current.leads.find((x) => x.id === id)?.status ?? "new";
        return mutate(
          "lead.close",
          (d) => ({
            ...d,
            leads: d.leads.map((x) => (x.id === id ? { ...x, status: close, lostReason: reason, lostReasonText: text, lastActivityAt: at } : x)),
            activities: [{ id: activityId, subjectType: "lead", subjectId: id, kind: "status", meta: { from, to: close, reason }, at, actorId: d.me }, ...d.activities],
          }),
          { k: "lead.close", leadId: id, status: close, reason, text, activityId, from: dbStatus(from) },
        );
      },
      reopenLead: (id) => {
        const activityId = uid();
        const at = new Date().toISOString();
        const from = dbRef.current.leads.find((x) => x.id === id)?.status ?? "lost";
        return mutate(
          "lead.reopen",
          (d) => ({
            ...d,
            leads: d.leads.map((x) => (x.id === id ? { ...x, status: "replied", lostReason: undefined, lostReasonText: undefined, lastActivityAt: at } : x)),
            activities: [{ id: activityId, subjectType: "lead", subjectId: id, kind: "status", meta: { from, to: "replied" }, at, actorId: d.me }, ...d.activities],
          }),
          { k: "lead.reopen", leadId: id, activityId, from: dbStatus(from) },
        );
      },
      assignLead: (id, memberId) => {
        const activityId = uid();
        const at = new Date().toISOString();
        return mutate(
          "lead.assign",
          (d) => ({
            ...d,
            leads: d.leads.map((x) => (x.id === id ? { ...x, assigneeId: memberId, lastActivityAt: at } : x)),
            activities: [{ id: activityId, subjectType: "lead", subjectId: id, kind: "assigned", meta: { to: memberId }, at, actorId: d.me }, ...d.activities],
          }),
          { k: "lead.assign", leadId: id, userId: memberId, activityId },
        );
      },
      setLeadCost: (id, cents) =>
        mutate("lead.cost", (d) => ({ ...d, leads: d.leads.map((x) => (x.id === id ? { ...x, costCents: cents } : x)) }), { k: "lead.cost", leadId: id, cents }),
      saveLeadPeople: (leadId, people) => {
        const l = dbRef.current.leads.find((x) => x.id === leadId);
        if (!l) return () => {};
        const named = people.map((p, i) => (i === 0 ? { ...p, name: l.name, role: "main" as const } : p));
        if (l.customerId && dbRef.current.customers.some((c) => c.id === l.customerId)) return saveCustomerPeople(l.customerId, named);
        const clean = cleanPeople(named, uid);
        const { phone, email } = mainContact(clean);
        return mutate(
          "lead.people",
          (d) => ({ ...d, leads: d.leads.map((x) => (x.id === leadId ? { ...x, people: clean, phone, email, phone2: undefined, phone2Label: undefined, contacts: undefined } : x)) }),
          { k: "lead.people", id: leadId, people: clean },
        );
      },
      saveTask: (t) => {
        const id = t.id ?? uid();
        const task = { ...t, id };
        const undo = mutate(
          "task.save",
          (d) => ({ ...d, tasks: d.tasks.some((x) => x.id === id) ? d.tasks.map((x) => (x.id === id ? task : x)) : [...d.tasks, task] }),
          { k: "task.save", task },
        );
        return { id, undo };
      },
      saveSource: (src) => {
        const id = src.id ?? uid();
        const position = src.position ?? Math.max(0, ...dbRef.current.sources.map((x) => x.position ?? 0)) + 1;
        const source = { ...src, id, position };
        const undo = mutate(
          "source.save",
          (d) => ({ ...d, sources: d.sources.some((x) => x.id === id) ? d.sources.map((x) => (x.id === id ? source : x)) : [...d.sources, source] }),
          { k: "source.save", source },
        );
        return { id, undo };
      },
      bookLead: (id, at) => {
        const l = dbRef.current.leads.find((x) => x.id === id);
        if (!l || !isOpenLeadStatus(l.status)) return () => {};
        // one planned estimate visit at a time (double tap, second booking): reschedule lives in the Plan
        const d0 = dbRef.current;
        if (l.propertyId && d0.visits.some((v) => new Date(v.start).getTime() > Date.now() && d0.jobs.some((j) => j.id === v.jobId && j.propertyId === l.propertyId && j.status === "estimate"))) return () => {};
        const target = leadTarget(id);
        if (!target) return () => {};
        const ids = { jobId: uid(), visitId: uid() };
        const now = new Date().toISOString();
        const undoVisit = mutate(
          "lead.book",
          (d) => ({
            ...d,
            leads: d.leads.map((x) =>
              x.id === id ? { ...x, status: x.status === "new" || x.status === "replied" ? "booked" : x.status, firstResponseAt: x.firstResponseAt ?? now, lastActivityAt: now } : x,
            ),
            jobs: [...d.jobs, { id: ids.jobId, propertyId: target.propertyId, title: "Estimate visit", status: "estimate", amountCents: 0 }],
            visits: [
              ...d.visits,
              {
                id: ids.visitId, jobId: ids.jobId, techId: at.techId, start: at.start, durationMin: at.durationMin, step: "scheduled",
                scope: [at.note?.trim(), l.message].filter((x): x is string => !!x), checklist: [], photos: [], amountDueCents: 0,
              },
            ],
          }),
          {
            k: "lead.visit", leadId: id, customerId: target.customerId, propertyId: target.propertyId, ...ids, start: at.start, durationMin: at.durationMin,
            techId: at.techId, scope: [at.note?.trim(), l.message].filter((x): x is string => !!x),
          },
        );
        return () => {
          undoVisit();
          target.undo();
        };
      },
      addLead: (lead) => {
        const id = uid();
        const d0 = dbRef.current;
        // new leads go to the owner by default (founder 04.11); the creator is remembered (a tech keeps seeing his lead)
        const owner = d0.members.find((m) => m.roles.includes("director"))?.id ?? d0.me;
        // provisional number for the screen; the server assigns the real one (it ignores what the app sends)
        const last = Math.max(0, ...d0.leads.map((x) => Number(/^[A-Z]+-(\d+)$/.exec(x.number ?? "")?.[1] ?? 0)));
        const number = `LEA-${String(last + 1).padStart(4, "0")}`;
        const full: Lead = { assigneeId: owner, createdBy: d0.me, ...lead, id, number, status: "new", receivedAt: new Date().toISOString() };
        const { name: _n, phone: _p, city: _c, address: _a, sourceId: _s, message: _m, number: _no, ...rest } = full;
        const undo = mutate("lead.add", (d) => ({ ...d, leads: [full, ...d.leads] }), {
          k: "lead.add", id, name: full.name, phone: full.phone, city: full.city, address: full.address, sourceId: full.sourceId, message: full.message,
          costCents: full.costCents, cols: leadCols(rest as LeadPatch, full),
        });
        return { id, undo };
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
        return inv ? recordPayment(id, inv.totalCents - inv.paidCents, method) : () => {};
      },
      recordPayment: (invoiceId, amountCents, method, reference, fromClient) => recordPayment(invoiceId, amountCents, method, reference, fromClient),
      issueInvoice: (jobId, kind, amountCents, title) => {
        const d0 = dbRef.current;
        const job = d0.jobs.find((j) => j.id === jobId);
        const customerId = job ? d0.properties.find((p) => p.id === job.propertyId)?.customerId : undefined;
        if (!job || !customerId || amountCents <= 0) return () => {};
        const id = uid();
        const now = new Date().toISOString();
        return mutate(
          "invoice.issue",
          (d) => ({
            ...d,
            invoices: [
              ...d.invoices,
              { id, customerId, jobId, kind, title, totalCents: amountCents, paidCents: 0, dueDate: now, sentAt: now, number: modeRef.current === "demo" ? nextInvoiceNumber(d) : undefined },
            ],
          }),
          { k: "invoice.issue", id, jobId, customerId, kind, title, totalCents: amountCents },
        );
      },
      sendEstimate: (id, tk) => {
        const token = dbRef.current.estimates.find((e) => e.id === id)?.token ?? tk ?? newToken();
        return mutate(
          "estimate.send",
          (d) => {
            const est = d.estimates.find((e) => e.id === id);
            const now = new Date().toISOString();
            return {
              ...d,
              estimates: d.estimates.map((e) =>
                e.id === id
                  ? {
                      ...e, token, status: e.status === "draft" ? "sent" : e.status, sentAt: e.sentAt ?? now,
                      // E2a: every send of a new version gets a fresh "valid until"; a revoked link is replaced by the new token
                      validUntil: e.status === "draft" ? validUntilFor(d.company, new Date(now)) : e.validUntil, linkRevokedAt: undefined,
                    }
                  : e,
              ),
              leads: est?.leadId
                ? d.leads.map((l) => (l.id === est.leadId && (l.status === "new" || l.status === "replied" || l.status === "booked") ? { ...l, status: "estimate_sent", lastActivityAt: now } : l))
                : d.leads,
            };
          },
          { k: "estimate.send", id, token },
        );
      },
      saveEstimate: ({ id, customerId, propertyId, title, doc: doc0, leadId: leadId0 }) => {
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
              id, customerId, propertyId, title, doc, status: "draft", ...sum, leadId: leadId0 ?? prev?.leadId,
              // «don't sign — change it»: the client signs the new version again (the old signature stays on the server)
              ...(prev?.status === "awaiting_countersign" ? { approval: undefined, signature: undefined } : {}),
              sentAt: prev?.status === "draft" ? prev.sentAt : undefined,
            };
            return { ...d, estimates: prev ? d.estimates.map((e) => (e.id === id ? next : e)) : [...d.estimates, next] };
          },
          { k: "estimate.save", id, versionId, customerId, propertyId, leadId: leadId0 ?? prev?.leadId, title, doc: clientDoc(doc), costs: costsOf(doc), totalCents: sum.totalCents, depositCents: sum.depositCents, marginPct: sum.marginPct },
        );
      },
      approveEstimate: (id, a) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e?.doc || e.status === "approved" || e.status === "awaiting_countersign") return () => {};
        const token = e.token ?? newToken();
        const ids = { jobId: dbRef.current.jobs.find((j) => j.estimateId === id)?.id ?? uid(), invoiceId: uid() };
        const now = new Date().toISOString();
        return mutate("estimate.approve", (d) => clientSigned(d, id, a, ids, now, token), {
          k: "estimate.approve", id, token, optionId: a.optionId, addonIds: a.addonIds, signer: a.signerName, svg: a.signature, channel: a.channel, jobId: ids.jobId, invoiceId: ids.invoiceId,
        });
      },
      countersignEstimate: (id, signature) => {
        const d0 = dbRef.current;
        const e = d0.estimates.find((x) => x.id === id);
        if (!e || e.status !== "awaiting_countersign" || !canCountersign(d0, d0.me)) return () => {};
        const now = new Date().toISOString();
        // the same ids on the phone and the server (the client may have signed on the page: no ids were stored then)
        const ids = { jobId: d0.jobs.find((j) => j.estimateId === id)?.id ?? e.approval?.jobId ?? uid(), invoiceId: e.approval?.invoiceId ?? uid() };
        return mutate(
          "estimate.countersign",
          (d) => companySigned(d, id, { userId: d.me, signature, method: "drawn" }, ids, now, (x) => (modeRef.current === "demo" ? nextInvoiceNumber(x) : undefined)),
          { k: "estimate.countersign", id, svg: signature, jobId: ids.jobId, invoiceId: ids.invoiceId },
        );
      },
      revokeEstimateLink: (id) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        // the server allows the director and the office only (revoke_estimate_link)
        if (!e?.token || !canManageLink(dbRef.current, dbRef.current.me)) return () => {};
        const now = new Date().toISOString();
        return mutate("estimate.revoke", (d) => ({ ...d, estimates: d.estimates.map((x) => (x.id === id ? { ...x, token: undefined, linkRevokedAt: now } : x)) }), {
          k: "estimate.revoke", id,
        });
      },
      leadEstimateTarget: (leadId) => leadTarget(leadId),
      convertLead: (leadId, reasonText) => {
        const d0 = dbRef.current;
        const l = d0.leads.find((x) => x.id === leadId);
        if (!l || l.status === "won") return () => {};
        const ids = { customerId: l.customerId ?? uid(), contactId: uid(), propertyId: l.propertyId ?? uid(), noteId: uid() };
        const needCustomer = !l.customerId;
        const now = new Date().toISOString();
        return mutate(
          "lead.convert",
          (d) => ({
            ...d,
            customers: needCustomer
              ? [...d.customers, { id: ids.customerId, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, balanceCents: 0, status: "active", people: clientPeopleFromLead(l, ids.contactId) }]
              : d.customers.map((c) => (c.id === ids.customerId ? { ...c, status: "active" } : c)),
            properties: needCustomer ? [...d.properties, { id: ids.propertyId, customerId: ids.customerId, address: l.address ?? "", city: l.city, stories: 1 }] : d.properties,
            leads: d.leads.map((x) => (x.id === leadId ? { ...x, status: "won", wonVia: "manual", customerId: ids.customerId, propertyId: ids.propertyId, lastActivityAt: now } : x)),
            notes: [{ id: ids.noteId, subjectType: "customer", subjectId: ids.customerId, body: reasonText, visibility: "team", pinned: false, authorId: d.me, at: now }, ...d.notes],
          }),
          {
            k: "lead.convert", leadId, needCustomer, ...ids, name: l.name, phone: l.phone, email: l.email, sourceId: l.sourceId, address: l.address ?? "", city: l.city, note: reasonText,
          },
        );
      },
      addCustomer: (x) => {
        const ids = { customerId: uid(), contactId: uid(), propertyId: uid() };
        const undo = mutate(
          "customer.create",
          (d) => ({
            ...d,
            customers: [
              ...d.customers,
              { id: ids.customerId, number: modeRef.current === "demo" ? nextClientNumber(d) : undefined, name: x.name, phone: x.phone, email: x.email, sourceId: x.sourceId, balanceCents: 0, status: "active" },
            ],
            properties: [...d.properties, { id: ids.propertyId, customerId: ids.customerId, address: x.address, city: x.city, stories: 1 }],
          }),
          { k: "customer.create", ...ids, ...x },
        );
        return { id: ids.customerId, undo };
      },
      saveCustomerPeople,
      setCustomerTags: (id, tagIds) =>
        mutate("customer.tags", (d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, tagIds } : c)) }), { k: "customer.tags", id, tagIds }),
      setCustomerStatus: (id, status, reason) =>
        mutate(
          "customer.status",
          (d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, status, statusReason: status === "do_not_service" ? reason : undefined } : c)) }),
          { k: "customer.status", id, status, reason: status === "do_not_service" ? reason : undefined },
        ),
      saveTag: (tg) => {
        const id = tg.id ?? uid();
        const position = tg.position ?? Math.max(0, ...dbRef.current.tags.map((x) => x.position)) + 1;
        const tag: Tag = { ...tg, id, position };
        const undo = mutate(
          "tag.save",
          (d) => ({ ...d, tags: d.tags.some((x) => x.id === id) ? d.tags.map((x) => (x.id === id ? tag : x)) : [...d.tags, tag] }),
          { k: "tag.save", tag },
        );
        return { id, undo };
      },
      updateCustomer: (id, patch) =>
        mutate("customer.update", (d) => ({ ...d, customers: d.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) }), { k: "customer.update", id, ...patch }),
      saveProperty: (p) => {
        const city = p.place ? cityLine(p.place) : p.city;
        const next: Property = { ...p, city, address: p.address.trim(), unit: p.unit?.trim() || undefined, label: p.label?.trim() || undefined, accessNotes: p.accessNotes?.trim() || undefined };
        const { gateCode: _g, ...row } = next;
        return mutate(
          "property.save",
          (d) => ({
            ...d,
            properties: d.properties.some((x) => x.id === p.id)
              ? d.properties.map((x) => (x.id === p.id ? { ...next, gateCode: x.gateCode } : x))
              : [...d.properties, next],
          }),
          { k: "property.save", property: row },
        );
      },
      setGateCode: (propertyId, code) =>
        mutate(
          "property.gate",
          (d) => ({ ...d, properties: d.properties.map((x) => (x.id === propertyId ? { ...x, gateCode: code.trim() || undefined } : x)) }),
          { k: "property.gate", id: propertyId, code: code.trim() },
        ),
      updateProperty: (id, patch) =>
        mutate("property.update", (d) => ({ ...d, properties: d.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), { k: "property.update", id, ...patch }),
      addNote: (n) => {
        const id = uid();
        const at = new Date().toISOString();
        return mutate("note.add", (d) => ({ ...d, notes: [{ ...n, id, at, authorId: d.me, pinned: false }, ...d.notes] }), { k: "note.add", id, ...n });
      },
      updateNote: (id, patch) =>
        mutate(
          "note.update",
          (d) => ({
            ...d,
            notes: patch.deleted ? d.notes.filter((x) => x.id !== id) : d.notes.map((x) => (x.id === id ? { ...x, ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}), ...(patch.body !== undefined ? { body: patch.body } : {}) } : x)),
          }),
          { k: "note.update", id, ...patch },
        ),
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
      inviteMember: (m) => {
        if (modeRef.current !== "demo") return () => {};
        const initials = m.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase() || "?";
        return mutate("member.invite", (d) => ({ ...d, members: [...d.members, { id: uid(), ...m, initials, pending: true }] }));
      },
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
              // E2a: the client's signature waits for the company's (S8 → S8b), also for a legacy quick estimate
              e.id === id && e.status !== "approved" ? { ...e, status: "awaiting_countersign", signature: path, sentAt: e.sentAt ?? new Date().toISOString() } : e,
            ),
          }),
          { k: "estimate.sign", id, svg: path, signer: dbRef.current.customers.find((c) => c.id === dbRef.current.estimates.find((x) => x.id === id)?.customerId)?.name ?? "Client" },
        ),
      payDeposit: (id, method, fromClient) => {
        const e = dbRef.current.estimates.find((x) => x.id === id);
        if (!e || !e.depositCents) return () => {};
        const job0 = dbRef.current.jobs.find((j) => j.estimateId === id);
        const depInv = job0 ? dbRef.current.invoices.find((i) => i.jobId === job0.id && i.kind === "deposit") : undefined;
        if (depInv) return recordPayment(depInv.id, depInv.totalCents - depInv.paidCents, method, undefined, fromClient);
        const now = new Date().toISOString();
        const existingJob = dbRef.current.jobs.find((j) => j.estimateId === id);
        const jobId = existingJob?.id ?? uid();
        const invoiceId = uid();
        const paymentId = uid();
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
              { id: invoiceId, customerId: e.customerId, jobId, totalCents: e.depositCents!, paidCents: e.depositCents!, dueDate: now, paidAt: now, method, kind: "deposit", title: "Deposit" },
            ],
            payments: [
              { id: paymentId, invoiceId, customerId: e.customerId, amountCents: e.depositCents!, method, at: now, receiptNumber: modeRef.current === "demo" ? nextReceipt(d) : undefined },
              ...d.payments,
            ],
          }),
          {
            k: "estimate.deposit", id, jobId, invoiceId, paymentId, method, customerId: e.customerId, propertyId: e.propertyId,
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

export { isToday, isOverdue, visitContext, minutesSince, daysSince, customerBalance, jobProfit } from "./selectors";
