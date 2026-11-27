/**
 * The client's «Замер» (#2996, founder 27.11: «открыл клиента, нажал замеры … открылась не карточка замер … а карточка создания
 * нового эстимейта»): the header icon is the measurement of the switched-on module that measures (its `client` place, action
 * `measure`) — the address's measurement (one), the module's start screen with the addresses (several) or with «add an address»
 * (none). No measuring module — no icon: the core does not pretend; a new estimate is the main step and «＋», not «Замер».
 */
import type { DB, Property, Role } from "@/data/types";
import { placeActions, type PlaceCtx } from "@/modules/registry";

/** the client place's context the modules read: the client, its leads, its addresses with their leads */
export function clientPlaceCtx(db: Pick<DB, "leads">, customerId: string, leadIds: string[], properties: readonly Property[]): Omit<PlaceCtx, "role"> {
  return {
    customerId,
    leadIds,
    places: properties.map((p) => ({ id: p.id, address: p.address, ...(p.city ? { city: p.city } : {}), leadIds: db.leads.filter((l) => l.propertyId === p.id).map((l) => l.id) })),
  };
}

/** where the client's «Замер» goes, or nothing when no switched-on module measures */
export function clientMeasureHref(db: DB, role: Role, ctx: Omit<PlaceCtx, "role">, now = Date.now()): string | undefined {
  return placeActions("client", db.company, { ...ctx, role }, now, db.moduleData).find((a) => a.id === "measure")?.href;
}
