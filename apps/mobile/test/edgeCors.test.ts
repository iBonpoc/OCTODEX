/**
 * #1605: the account and money edge functions answer only the app's own sites (production, PR previews, a local web
 * build) — never «*». A page of another site gets no «Allow-Origin» (the browser does not hand it the answer); the phone
 * app sends no Origin and is not affected. Red before the fix: every answer carried «Access-Control-Allow-Origin: *».
 */
import { describe, expect, it } from "vitest";
import { handleDelete } from "../../../supabase/functions/delete-account/handler";
import { handleConnect } from "../../../supabase/functions/stripe-connect/handler";
import { handleRefund } from "../../../supabase/functions/stripe-refund/handler";

const req = (method: string, origin: string | null) => ({
  method,
  header: (n: string) => (n.toLowerCase() === "origin" ? origin : null),
  text: async () => "",
});
const fns = { "delete-account": handleDelete, "stripe-connect": handleConnect, "stripe-refund": handleRefund } as const;
const call = (f: (typeof fns)[keyof typeof fns], method: string, origin: string | null) =>
  (f as (r: ReturnType<typeof req>, d: never) => Promise<{ status: number; headers: Record<string, string> }>)(req(method, origin), {} as never);

describe("edge functions: CORS only for our sites (#1605)", () => {
  for (const [name, f] of Object.entries(fns)) {
    it(`${name}: our production site and a PR preview are named, never «*»`, async () => {
      for (const o of ["https://gorix.expo.app", "https://gorix--abc123.expo.app", "http://localhost:8081"]) {
        const r = await call(f, "OPTIONS", o);
        expect(r.status).toBe(204);
        expect(r.headers["Access-Control-Allow-Origin"], o).toBe(o);
        expect(r.headers.Vary).toBe("Origin");
      }
    });
    it(`${name}: another site, a look-alike, no Origin — no «Allow-Origin» at all`, async () => {
      for (const o of ["https://evil.example", "https://gorix.expo.app.evil.example", "https://evilgorix.expo.app", "http://gorix.expo.app", null]) {
        const pre = await call(f, "OPTIONS", o);
        expect(pre.headers["Access-Control-Allow-Origin"], String(o)).toBeUndefined();
        const post = await call(f, "GET", o); // 405, any answer: never «*»
        expect(post.status).toBe(405);
        expect(post.headers["Access-Control-Allow-Origin"], String(o)).toBeUndefined();
      }
    });
  }
});
