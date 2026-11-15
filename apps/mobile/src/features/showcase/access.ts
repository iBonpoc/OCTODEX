import type { Role } from "@/data/types";

/** Who sees the design showcase (#1093): the company owner (the director) in the cloud, anyone in the demo.
 *  The row in Settings and the route itself ask the same function. */
export const canSeeShowcase = (mode: "cloud" | "demo", role: Role): boolean => mode === "demo" || role === "director";
