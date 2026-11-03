/**
 * Local store with the same interface the synced store (Supabase + PowerSync, wave 5) will expose.
 * Every mutation is offline-first: applied locally at once, and queued when there is no network.
 * Each mutation returns an `undo` so screens can offer the 5-second "Undo" toast (DS rule 10).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { makeSeed } from "./seed";
import {
  VISIT_STEPS,
  type DB,
  type ID,
  type PaymentMethod,
  type QueuedAction,
  type Role,
  type Visit,
  type VisitStep,
} from "./types";

type Undo = () => void;

interface StoreCtx {
  db: DB;
  role: Role;
  setRole: (r: Role) => void;
  online: boolean;
  setOnline: (v: boolean) => number;
  queue: QueuedAction[];
  advanceVisit: (id: ID) => Undo;
  addPhoto: (visitId: ID, kind: "before" | "after", uri?: string) => Undo;
  toggleCheck: (visitId: ID, itemId: ID) => Undo;
  signVisit: (visitId: ID, path: string) => Undo;
  payVisit: (visitId: ID, method: PaymentMethod) => Undo;
  replyLead: (id: ID) => Undo;
  bookLead: (id: ID) => Undo;
  assignVisit: (visitId: ID, techId: ID) => Undo;
}

const Ctx = createContext<StoreCtx | null>(null);
let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(makeSeed);
  const [role, setRole] = useState<Role>("tech");
  const [online, setOnlineState] = useState(true);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const dbRef = useRef(db);
  dbRef.current = db;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  /** Apply a change; queue it when offline; return undo that restores the previous snapshot. */
  const mutate = useCallback((label: string, fn: (d: DB) => DB): Undo => {
    const prev = dbRef.current;
    const next = fn(prev);
    dbRef.current = next;
    setDb(next);
    let qid: string | null = null;
    if (!onlineRef.current) {
      qid = uid("q");
      const item = { id: qid, label, at: new Date().toISOString() };
      setQueue((q) => [...q, item]);
    }
    return () => {
      dbRef.current = prev;
      setDb(prev);
      if (qid) setQueue((q) => q.filter((x) => x.id !== qid));
    };
  }, []);

  const patchVisit = (d: DB, id: ID, fn: (v: Visit) => Visit): DB => ({
    ...d,
    visits: d.visits.map((v) => (v.id === id ? fn(v) : v)),
  });

  const value = useMemo<StoreCtx>(
    () => ({
      db,
      role,
      setRole,
      online,
      queue,
      setOnline: (v) => {
        setOnlineState(v);
        onlineRef.current = v;
        let sent = 0;
        if (v) {
          sent = queue.length;
          setQueue([]);
        }
        return sent;
      },
      advanceVisit: (id) =>
        mutate("visit.step", (d) =>
          patchVisit(d, id, (v) => {
            const i = VISIT_STEPS.indexOf(v.step);
            const step: VisitStep = VISIT_STEPS[Math.min(i + 1, VISIT_STEPS.length - 1)];
            return { ...v, step, late: step === "on_site" ? false : v.late };
          }),
        ),
      addPhoto: (visitId, kind, uri) =>
        mutate("photo.add", (d) => patchVisit(d, visitId, (v) => ({ ...v, photos: [...v.photos, { id: uid("ph"), kind, uri }] }))),
      toggleCheck: (visitId, itemId) =>
        mutate("check.toggle", (d) =>
          patchVisit(d, visitId, (v) => ({
            ...v,
            checklist: v.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
          })),
        ),
      signVisit: (visitId, path) =>
        mutate("visit.sign", (d) => patchVisit(d, visitId, (v) => ({ ...v, signature: path, step: "signed" }))),
      payVisit: (visitId, method) =>
        mutate("visit.pay", (d) => {
          const v = d.visits.find((x) => x.id === visitId);
          if (!v) return d;
          const job = d.jobs.find((j) => j.id === v.jobId);
          const prop = d.properties.find((p) => p.id === job?.propertyId);
          const now = new Date().toISOString();
          const next = patchVisit(d, visitId, (x) => ({
            ...x,
            step: "paid",
            payment: { method, amountCents: x.amountDueCents, at: now },
          }));
          return {
            ...next,
            jobs: next.jobs.map((j) => (j.id === v.jobId ? { ...j, status: "done" } : j)),
            invoices: prop
              ? [
                  ...next.invoices,
                  {
                    id: uid("i"),
                    customerId: prop.customerId,
                    jobId: v.jobId,
                    totalCents: v.amountDueCents,
                    paidCents: v.amountDueCents,
                    dueDate: now,
                    paidAt: now,
                  },
                ]
              : next.invoices,
          };
        }),
      replyLead: (id) =>
        mutate("lead.reply", (d) => ({ ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, status: "replied" } : l)) })),
      bookLead: (id) =>
        mutate("lead.book", (d) => ({ ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, status: "booked" } : l)) })),
      assignVisit: (visitId, techId) => mutate("visit.assign", (d) => patchVisit(d, visitId, (v) => ({ ...v, techId }))),
    }),
    [db, role, online, queue, mutate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}

/* ---------- selectors ---------- */
export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function visitContext(db: DB, v: Visit) {
  const job = db.jobs.find((j) => j.id === v.jobId);
  const property = db.properties.find((p) => p.id === job?.propertyId);
  const customer = db.customers.find((c) => c.id === property?.customerId);
  const tech = db.members.find((m) => m.id === v.techId) ?? null;
  return { job, property, customer, tech };
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}
export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
