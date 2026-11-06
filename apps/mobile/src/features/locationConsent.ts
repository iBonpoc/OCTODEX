/**
 * Wave 7б-2 (docs/specs/03 §12; review #217): switching the location consent on and off, and its «Отменить».
 * Kept apart from the store so the rules are testable without React:
 * - only the consent field (and, going off, my points) changes — never a snapshot of the whole data: a step taken in
 *   the same moment («Я в пути») must survive an undo or a refusal;
 * - ON goes straight to the server (the notice mark is the moment the person agreed; a refusal turns it back off and
 *   says so); OFF — a withdrawal of consent — goes through the offline queue, so it reaches the server even later;
 * - «Отменить» after ON queues OFF only after ON has finished: the server always gets them in that order.
 */
import type { DB } from "@/data/types";
import type { Op } from "@/cloud/ops";

export interface ConsentDeps {
  get: () => DB;
  set: (d: DB) => void;
  /** the cloud (a server to tell); the demo keeps it on the phone */
  cloud: boolean;
  /** ON / OFF right now (public.set_location_consent); rejects on a refusal or no network */
  sendNow: (on: boolean) => Promise<void>;
  /** puts an op in the offline queue; returns «take it back if it has not left yet» */
  enqueue: (op: Op) => () => boolean;
}

export interface ConsentChange {
  undo: () => void;
  /** true — the server (or the demo) has it; false — refused, already turned back */
  done: Promise<boolean>;
}

/** only my consent changes (going off also forgets my points on the phone) */
export function withConsent(d: DB, on: boolean, ackAt?: string): DB {
  return {
    ...d,
    location: { allowed: d.location?.allowed === true, on, ...(ackAt ? { ackAt } : {}) },
    visitPoints: on ? d.visitPoints : (d.visitPoints ?? []).filter((x) => x.userId !== d.me),
  };
}

export function changeConsent(deps: ConsentDeps, on: boolean, now = new Date().toISOString()): ConsentChange {
  const before = deps.get().location;
  if (on) {
    deps.set(withConsent(deps.get(), true, now));
    if (!deps.cloud) return { undo: () => deps.set(withConsent(deps.get(), false, before?.ackAt)), done: Promise.resolve(true) };
    const done = deps.sendNow(true).then(
      () => true,
      () => {
        deps.set(withConsent(deps.get(), false, before?.ackAt));
        return false;
      },
    );
    return {
      undo: () => {
        deps.set(withConsent(deps.get(), false, before?.ackAt));
        // after ON has finished: OFF never overtakes it; nothing to take back if ON was refused
        void done.then((ok) => ok && deps.enqueue({ k: "me.location", on: false }));
      },
      done,
    };
  }
  deps.set(withConsent(deps.get(), false, before?.ackAt));
  const takeBack = deps.cloud ? deps.enqueue({ k: "me.location", on: false }) : () => true;
  return {
    undo: () => {
      // still on the phone: nothing reached the server, the consent simply stays on
      if (takeBack()) deps.set(withConsent(deps.get(), true, before?.ackAt));
      // already sent: turning it back on needs the server again (with a new notice mark)
      else void changeConsent(deps, true).done;
    },
    done: Promise.resolve(true),
  };
}
