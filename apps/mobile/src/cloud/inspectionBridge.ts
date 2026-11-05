/**
 * Wave П1a bridge (docs/specs/03 §3.1, migration 20261105280000): an inspection is a visit without a job now.
 * Until wave П1b reads visits by their property, the app shows such a visit the old way, through an in-memory
 * job "estimate" with the id `insp-<visit id>`. That id never reaches the server. Pure — test/inspectionBridge.test.ts.
 */
export const inspectionJobId = (visitId: string) => `insp-${visitId}`;

/** a job id the server knows, or null for the in-memory inspection job */
export const realJob = (jobId: string | null | undefined): string | null => (jobId && !jobId.startsWith("insp-") ? jobId : null);
