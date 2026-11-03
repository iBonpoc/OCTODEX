/**
 * Supabase project of OCTODEX (dashboard name "Naryad" until renamed; region us-west-1), created 03.11.2026.
 * The publishable key is public by design (it only works together with RLS); never put the service key here.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://kgiaxygsjkyiquhjbxdg.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? "sb_publishable_-DZJwLnp1quJvRDDSv1ABw_JR4P_dUi";

/** Public web app (Cloudflare Workers static assets, auto-deploys from main). Used for email links. */
export const WEB_APP_URL = "https://octodex.uoboxx.workers.dev";
