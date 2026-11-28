/**
 * #3076 «Фото и файлы» клиента: every photo of the client's visits and every file of the client in one place. Pure — tested in
 * test/clientMedia.test.ts. The photos are grouped by visit (the newest first: a visit is the moment a photo was made, as the
 * moments of iOS «Фото»), each group knows its job and property so the screen can filter by property and job. A file row of
 * kind «photo» with a visit is a view on the visit's photo (FileItem doc) — counted once, through the visit. A photo of the client
 * without a visit (#3085) is in `loose`: no property or job — shown only while nothing is filtered (unless it names a job).
 */
import { visitPropertyId } from "@/data/selectors";
import type { DB, FileItem, ID, Job, Photo, Property, Role, Visit } from "@/data/types";
import { techVisitCounts } from "@/features/comms/comms";

export interface MediaGroup {
  visit: Visit;
  job?: Job;
  propertyId?: ID;
  photos: Photo[];
}
export interface ClientMedia {
  groups: MediaGroup[];
  /** #3085: the client's photos without a visit (sent by the client, added on the client's «Фото и файлы») — a grid of their own */
  loose: FileItem[];
  /** the client's files that are not photos (documents, receipts, drawings, signatures) */
  files: FileItem[];
  /** photos + files: the number on the row «Фото и файлы · N» */
  total: number;
}

export function clientMediaOf(db: Pick<DB, "jobs" | "files">, visits: readonly Visit[], customerId: ID, jobIds: ReadonlySet<ID>): ClientMedia {
  const groups: MediaGroup[] = visits
    .filter((v) => (v.photos ?? []).length > 0)
    .map((v) => ({ visit: v, job: v.jobId ? db.jobs.find((j) => j.id === v.jobId) : undefined, propertyId: visitPropertyId(db, v), photos: v.photos }))
    .sort((a, b) => b.visit.start.localeCompare(a.visit.start));
  const shownPhotos = new Set(groups.flatMap((g) => g.photos.map((p) => p.id)));
  const own = (db.files ?? [])
    .filter((f) => f.customerId === customerId || (f.jobId && jobIds.has(f.jobId)))
    .filter((f) => !(f.kind === "photo" && shownPhotos.has(f.id)))
    .sort((a, b) => b.at.localeCompare(a.at));
  const isLoose = (f: FileItem) => f.kind === "photo" && !f.visitId;
  const loose = own.filter(isLoose);
  const files = own.filter((f) => !isLoose(f));
  return { groups, loose, files, total: totalOf(groups, loose, files) };
}

/** the filter of the screen: a property, then a job of it; null — all */
export interface MediaFilter {
  propertyId: ID | null;
  jobId: ID | null;
}

const totalOf = (groups: MediaGroup[], loose: FileItem[], files: FileItem[]) => groups.reduce((s, g) => s + g.photos.length, 0) + loose.length + files.length;

export function filterMedia(m: ClientMedia, f: MediaFilter, jobsOf: (fi: FileItem) => Job | undefined): ClientMedia {
  const keepGroup = (g: MediaGroup) => (!f.propertyId || g.propertyId === f.propertyId) && (!f.jobId || g.visit.jobId === f.jobId);
  const keepFile = (fi: FileItem) => {
    const j = jobsOf(fi);
    if (f.jobId) return fi.jobId === f.jobId;
    if (f.propertyId) return j?.propertyId === f.propertyId;
    return true;
  };
  const groups = m.groups.filter(keepGroup);
  const loose = m.loose.filter(keepFile);
  const files = m.files.filter(keepFile);
  return { groups, loose, files, total: totalOf(groups, loose, files) };
}

/** the properties and jobs that have something to show — the filter offers only those (an empty choice is never offered) */
export function mediaChoices(m: ClientMedia, properties: readonly Property[], jobs: readonly Job[], propertyId: ID | null) {
  const propIds = new Set<ID>([
    ...m.groups.map((g) => g.propertyId).filter((x): x is ID => !!x),
    ...m.files.map((f) => jobs.find((j) => j.id === f.jobId)?.propertyId).filter((x): x is ID => !!x),
  ]);
  const jobIds = new Set<ID>([...m.groups.map((g) => g.visit.jobId).filter((x): x is ID => !!x), ...m.files.map((f) => f.jobId).filter((x): x is ID => !!x)]);
  return {
    properties: properties.filter((p) => propIds.has(p.id)),
    jobs: jobs.filter((j) => jobIds.has(j.id) && (!propertyId || j.propertyId === propertyId)),
  };
}

/**
 * #3161: who may add a photo to the client here («＋» of «Фото и файлы») — the database's rule (files_insert, 20261115170000;
 * T474): the office (director, dispatcher, sales) — any client; a tech — only a client of his: a visit of his that counts
 * (techVisitCounts = app.tech_visit_counts) on the client's job, lead or property (app.is_customer_assignee); a subcontractor —
 * never (app.sub_file_ok: no customer_id). The tech who may not is not shown «＋»: the photo would be on the phone and refused.
 * One difference, to the safe side: the app folds a job «completed» and «closed» into «done» (statusMap) and does not count either,
 * the database stops counting only at «closed» — a tech whose job was completed today is not shown «＋» though it would be taken.
 */
export function canAddClientPhoto(db: Pick<DB, "me" | "jobs" | "visits" | "properties" | "members"> & { leads?: DB["leads"] }, role: Role, customerId: ID, now = Date.now()): boolean {
  if (role !== "tech") return true;
  if (db.members.some((m) => m.id === db.me && m.kind === "sub")) return false;
  const customerOf = (v: Visit): ID | undefined =>
    (v.jobId ? db.jobs.find((j) => j.id === v.jobId)?.customerId : undefined) ??
    (v.leadId ? db.leads?.find((l) => l.id === v.leadId)?.customerId : undefined) ??
    db.properties.find((p) => p.id === visitPropertyId(db as Pick<DB, "jobs" | "properties">, v))?.customerId;
  return db.visits.some((v) => customerOf(v) === customerId && techVisitCounts(db, v, now));
}

/**
 * #3161: who may «Удалить» a client's photo without a visit here — the database's files_update: the office; the row's author while
 * the client is still his. The phone knows a photo is his own while its file is on this phone (`uri`: taken here, not yet sent or
 * refused); a photo the client sent (from the server, no file here) or the office added is not his.
 */
export function canRemoveClientPhoto(db: Parameters<typeof canAddClientPhoto>[0], role: Role, customerId: ID, f: Pick<FileItem, "uri">, now = Date.now()): boolean {
  if (role !== "tech") return true;
  return !!f.uri && canAddClientPhoto(db, role, customerId, now);
}
