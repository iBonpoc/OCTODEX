/**
 * #3076 «Фото и файлы» клиента: every photo of the client's visits and every file of the client in one place. Pure — tested in
 * test/clientMedia.test.ts. The photos are grouped by visit (the newest first: a visit is the moment a photo was made, as the
 * moments of iOS «Фото»), each group knows its job and property so the screen can filter by property and job. A file row of
 * kind «photo» with a visit is a view on the visit's photo (FileItem doc) — counted once, through the visit.
 */
import { visitPropertyId } from "@/data/selectors";
import type { DB, FileItem, ID, Job, Photo, Property, Visit } from "@/data/types";

export interface MediaGroup {
  visit: Visit;
  job?: Job;
  propertyId?: ID;
  photos: Photo[];
}
export interface ClientMedia {
  groups: MediaGroup[];
  /** the client's files that are not a visit's photo (documents, receipts, drawings, signatures, a photo without a visit) */
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
  const files = (db.files ?? [])
    .filter((f) => f.customerId === customerId || (f.jobId && jobIds.has(f.jobId)))
    .filter((f) => !(f.kind === "photo" && shownPhotos.has(f.id)))
    .sort((a, b) => b.at.localeCompare(a.at));
  const total = groups.reduce((s, g) => s + g.photos.length, 0) + files.length;
  return { groups, files, total };
}

/** the filter of the screen: a property, then a job of it; null — all */
export interface MediaFilter {
  propertyId: ID | null;
  jobId: ID | null;
}

export function filterMedia(m: ClientMedia, f: MediaFilter, jobsOf: (fi: FileItem) => Job | undefined): ClientMedia {
  const keepGroup = (g: MediaGroup) => (!f.propertyId || g.propertyId === f.propertyId) && (!f.jobId || g.visit.jobId === f.jobId);
  const keepFile = (fi: FileItem) => {
    const j = jobsOf(fi);
    if (f.jobId) return fi.jobId === f.jobId;
    if (f.propertyId) return j?.propertyId === f.propertyId;
    return true;
  };
  const groups = m.groups.filter(keepGroup);
  const files = m.files.filter(keepFile);
  return { groups, files, total: groups.reduce((s, g) => s + g.photos.length, 0) + files.length };
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
