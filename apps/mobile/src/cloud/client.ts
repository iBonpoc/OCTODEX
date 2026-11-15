import "react-native-url-polyfill/auto";
import { sessionStore } from "./sessionStore";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config/backend";

/** One Supabase client for the whole app. The session is kept in the phone's protected store (sessionStore.ts, #1634);
 *  the web — localStorage. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: sessionStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});
