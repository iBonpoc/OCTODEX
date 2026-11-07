/**
 * Whose op is it (review #231, 19 §6.12). The outbox key is one for the phone: each op carries its owner, the signed-in
 * person sends, counts and undoes only theirs; another person's wait for them and are never lost — also when someone
 * else deletes their account on this phone. Pure (no React): test/storeSync.test.ts, test/accountCloud.test.ts.
 */
import type { OutboxItem } from "@/cloud/ops";
import { isDeviceKey } from "@/features/deleteAccount";

export const OUTBOX_KEY = "octo.outbox.v1";
export interface Owner {
  userId: string;
  companyId: string;
}
/**
 * An outbox op with whose it is, and how the server has been answering it (docs/specs/23 §3; optional — older
 * versions neither write nor need them and keep them when they copy an item): `failSince` — the first «not now» of the
 * server for this op in a row, `fails` — how many, `stuck` — shown as «не отправлено: сервер отвечает ошибкой».
 */
export type OwnedItem = OutboxItem & {
  owner?: Owner;
  failSince?: string;
  fails?: number;
  stuck?: true;
  /**
   * the ids the op makes on the server, decided when it was queued for an upsert that cannot tell by itself (an id not on
   * the phone before it — outboxDeps.madeOnQueue); none: by its kind (outboxDeps.CREATES). Older versions keep it.
   */
  made?: string[];
};

/**
 * The ops the signed-in person sends: theirs in this company, in order. Ops of older versions carry no owner: they go
 * as before — once, from whoever signs in after the update (nothing tells whose they were; the risk is only on a phone
 * where the outbox stayed and the person changed). The «не отправлено» counts and «Отменить» see only these.
 */
export const mineOf = (items: readonly OwnedItem[], who: Owner | null): OwnedItem[] =>
  who ? items.filter((o) => !o.owner || (o.owner.userId === who.userId && o.owner.companyId === who.companyId)) : [];

export const sameOwner = (a: Owner | null, b: Owner | null) => !!a && !!b && a.userId === b.userId && a.companyId === b.companyId;

/**
 * Ops of older versions carry no owner: the first person signed in when the outbox is loaded owns them — once (review
 * #240 №3), so they never follow the person into another company. Returns the same array when nothing changes.
 */
export function adoptLegacy(items: readonly OwnedItem[], who: Owner | null): readonly OwnedItem[] {
  if (!who || items.every((o) => o.owner)) return items;
  return items.map((o) => (o.owner ? o : { ...o, owner: { ...who } }));
}

/** the person's unsent ops in every company (an account deletion removes them all, review #240 №4) */
export const unsentOf = (items: readonly OwnedItem[], userId: string | null): number =>
  userId ? items.filter((o) => !o.owner || o.owner.userId === userId).length : 0;

/** the account of `userId` is deleted: what stays in the outbox — other people's ops (an op without owner counts as theirs) */
export const othersOf = (items: readonly OwnedItem[], userId: string | null): OwnedItem[] =>
  items.filter((o) => !!o.owner && o.owner.userId !== userId);

/** the keys the account deletion resets in memory: the device keys except the outbox, which is filtered (othersOf) */
export const wipedOnDelete = (k: string) => isDeviceKey(k) && k !== OUTBOX_KEY;

/** the stored outbox text → its ops (a broken value → none) */
export function parseOutbox(raw: string | null): OwnedItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as OwnedItem[]) : [];
  } catch {
    return [];
  }
}
