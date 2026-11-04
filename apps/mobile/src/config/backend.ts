/**
 * Supabase project of OCTODEX (dashboard name "Naryad" until renamed; region us-west-1), created 03.11.2026.
 * The publishable key is public by design (it only works together with RLS); never put the service key here.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://kgiaxygsjkyiquhjbxdg.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? "sb_publishable_-DZJwLnp1quJvRDDSv1ABw_JR4P_dUi";

/**
 * Public web app: Expo Hosting, deployed by the EAS workflow on every push to main.
 * Used for client links (/p/<token>) and email links. (Cloudflare octodex.uoboxx.workers.dev stopped rebuilding on 03.11.)
 */
export const WEB_APP_URL = "https://octodex.expo.app";
