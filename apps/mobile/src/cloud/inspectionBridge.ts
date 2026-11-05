/**
 * Jobs that the server does not know (docs/specs/03 §3.1): an inspection has no job; old phones may still hold an
 * in-memory id `insp-<visit>` from wave П1a. Such an id never reaches the server. Pure — test/inspectionBridge.test.ts.
 */
/** a job id the server knows, or null (no job, or an in-memory one) */
export const realJob = (jobId: string | null | undefined): string | null => (jobId && !jobId.startsWith("insp-") ? jobId : null);
