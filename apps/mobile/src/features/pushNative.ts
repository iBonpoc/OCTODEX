/**
 * The phone's parts of push (docs/specs/27-push.md §5) for push.ts. expo-notifications is loaded lazily and only on a
 * phone build of ours: the web and Expo Go never touch it, and an Expo update that reaches an older build without the
 * native module (runtimeVersion = sdkVersion) only switches pushes off instead of crashing.
 * The token is never logged, sent to analytics or shown.
 */
import { APP_NAME } from "@/config/product";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import type * as NotificationsModule from "expo-notifications";
import { supabase } from "@/cloud/client";
import { BUILD } from "@/config/version";
import { disable, PUSH_TOKEN_KEY, supportOf, type Permission, type PushDeps, type PushSupport } from "./push";

type N = typeof NotificationsModule;
let cached: N | null | undefined;

export const pushSupport: PushSupport = supportOf(Platform.OS, Constants.executionEnvironment as string | undefined);

/** the module, or null where pushes cannot work (web, Expo Go, a build without it) */
export function notifications(): N | null {
  if (cached !== undefined) return cached;
  if (pushSupport !== "device") return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-notifications") as N;
  } catch {
    cached = null;
  }
  return cached;
}

/** «1.0.0 · 272»: what the server keeps about the app on this phone */
export const appVersion = `${Constants.expoConfig?.version ?? "?"} · ${BUILD}`;

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

const asPermission = (s: string): Permission => (s === "granted" ? "granted" : s === "denied" ? "denied" : "undetermined");

/** a call to the server that never hangs: a phone without the line must not wait (sign out goes on) */
const SERVER_MS = 8_000;
async function withTimeout<T>(p: PromiseLike<T>): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<"timeout">((res) => (timer = setTimeout(() => res("timeout"), SERVER_MS)));
  try {
    return await Promise.race([Promise.resolve(p), t]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** the real parts; null where pushes cannot work */
export function nativePushDeps(): PushDeps | null {
  const n = notifications();
  if (!n || (Platform.OS !== "ios" && Platform.OS !== "android")) return null;
  return {
    platform: Platform.OS,
    permission: async () => asPermission((await n.getPermissionsAsync()).status),
    ask: async () => asPermission((await n.requestPermissionsAsync()).status),
    token: async () => {
      if (Platform.OS === "android") {
        // Android 13+ asks for the permission only after a channel exists
        await n.setNotificationChannelAsync("default", { name: APP_NAME, importance: n.AndroidImportance.HIGH });
      }
      return (await n.getExpoPushTokenAsync({ projectId: projectId() })).data;
    },
    register: async (token, platform, lang, version) => {
      const r = await withTimeout(supabase.rpc("register_push_device", { p_token: token, p_platform: platform, p_lang: lang, p_app_version: version }));
      if (r === "timeout") return "timeout";
      return r.error ? r.error.code ?? "error" : null;
    },
    forget: async (token) => {
      try {
        await withTimeout(supabase.rpc("forget_push_device", { p_token: token }));
      } catch {
        // the server forgets it anyway when Expo says the phone is gone (P3)
      }
    },
    load: () => AsyncStorage.getItem(PUSH_TOKEN_KEY).catch(() => null),
    save: async (token) => {
      await (token ? AsyncStorage.setItem(PUSH_TOKEN_KEY, token) : AsyncStorage.removeItem(PUSH_TOKEN_KEY)).catch(() => {});
    },
  };
}

/** before signing out (cloud/auth.tsx): this phone stops getting the person's pushes; never throws, never blocks long */
export async function forgetThisPhone(): Promise<void> {
  const d = nativePushDeps();
  if (!d) return;
  await disable(d).catch(() => {});
}
