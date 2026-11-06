/**
 * Wave 7б-2 (docs/specs/03 §12, Б1): the tech's location — only with their consent, only while the app is open and only
 * during their own visit. The server repeats every check (migration 20261106210000); these rules decide what the app
 * shows and when it asks the phone for a point. Thresholds are product rules, not design: kept here, not in tokens.
 */
import type { DB, ID, LocationState, Visit, VisitPoint, VisitStep } from "@/data/types";

/** «you are at the address»: this close to Property.geo, with a fix at least this precise */
export const NEAR_M = 150;
export const NEAR_ACCURACY_M = 100;
/** a point while the visit screen is open */
export const SEND_EVERY_MS = 5 * 60_000;
/** the office calls a point this old «a while ago» */
export const STALE_MS = 30 * 60_000;
/** the office sees points of an open visit for this long (the server: the same 12 h) */
export const OFFICE_WINDOW_MS = 12 * 3600_000;

export const LOCATION_OFF: LocationState = { allowed: false, on: false };

/** the app's steps «under way»: the server's en_route and on_site (working and signed are on site there) */
const SHARING_STEPS: VisitStep[] = ["en_route", "on_site", "working", "signed"];
export const isSharingStep = (step: VisitStep) => SHARING_STEPS.includes(step);

export const assigneesOf = (v: Visit): ID[] => v.assigneeIds ?? (v.techId ? [v.techId] : []);

/** the phone sends a point now: the company allows it, the person agreed, it is their visit and it is under way */
export function shouldShare(loc: LocationState | undefined, v: Visit, me: ID): boolean {
  const l = loc ?? LOCATION_OFF;
  return l.allowed && l.on && assigneesOf(v).includes(me) && isSharingStep(v.step);
}

/** ask for consent at the first «on the way»: the company allows it and the person never answered on this device */
export function shouldAskConsent(loc: LocationState | undefined, askedBefore: boolean): boolean {
  const l = loc ?? LOCATION_OFF;
  return l.allowed && !l.on && !askedBefore;
}

/** metres between two points (haversine) */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** the hint «You are at the address — mark On site?»: on the way, close enough, a precise enough fix */
export function nearAddress(step: VisitStep, p: Pick<VisitPoint, "lat" | "lng" | "accuracyM"> | null, geo?: { lat: number; lng: number }): boolean {
  if (step !== "en_route" || !p || !geo) return false;
  if (p.accuracyM != null && p.accuracyM > NEAR_ACCURACY_M) return false;
  return distanceM(p, geo) <= NEAR_M;
}

/** miles with one decimal, US format (0.1 at least: «0.0 mi» reads as an error) */
export const milesOf = (m: number): string => Math.max(0.1, m / 1609.344).toFixed(1);

/** the newest point of a person on a visit */
export function lastPoint(points: VisitPoint[] | undefined, visitId: ID, userId?: ID): VisitPoint | null {
  let best: VisitPoint | null = null;
  for (const p of points ?? []) {
    if (p.visitId !== visitId || (userId && p.userId !== userId)) continue;
    if (!best || p.at > best.at) best = p;
  }
  return best;
}

export interface OfficeLocationLine {
  userId: ID;
  /** miles from the address; absent when the property has no geo */
  miles?: string;
  minutesAgo: number;
  stale: boolean;
}

/** what the office sees on an open visit, per person: «on the way · 2.1 mi from the address · 3 min ago»; a person who
 *  does not share has no line (the screen says «not sharing») */
export function officeLines(db: Pick<DB, "visitPoints">, v: Visit, geo: { lat: number; lng: number } | undefined, now: number): OfficeLocationLine[] {
  if (!isSharingStep(v.step)) return [];
  const out: OfficeLocationLine[] = [];
  for (const userId of assigneesOf(v)) {
    const p = lastPoint(db.visitPoints, v.id, userId);
    if (!p) continue;
    const age = now - Date.parse(p.at);
    if (!(age <= OFFICE_WINDOW_MS)) continue;
    out.push({ userId, miles: geo ? milesOf(distanceM(p, geo)) : undefined, minutesAgo: Math.max(0, Math.floor(age / 60_000)), stale: age > STALE_MS });
  }
  return out;
}

/** keep one point per person and visit (the newest): the phone does not need the track */
export function keepLast(points: VisitPoint[] | undefined, p: VisitPoint): VisitPoint[] {
  return [...(points ?? []).filter((x) => !(x.visitId === p.visitId && x.userId === p.userId)), p];
}
