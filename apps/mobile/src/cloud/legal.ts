/** The consent on the server (wave 7а-1; supabase/migrations/20261106140000_legal_acceptance.sql). Needs the network. */
import { Platform } from "react-native";
import Constants from "expo-constants";
import { BUILD } from "@/config/version";
import { appVersionTag, LEGAL_VERSIONS, platformTag, type LegalStatus } from "@/features/legal";
import { supabase } from "./client";

export async function acceptLegal(): Promise<LegalStatus> {
  const { data, error } = await supabase.rpc("accept_legal", {
    p_versions: LEGAL_VERSIONS,
    p_platform: platformTag(Platform.OS),
    p_app_version: appVersionTag(Constants.expoConfig?.version ?? "1.0.0", BUILD),
  });
  if (error) throw new Error(error.message);
  return data as LegalStatus;
}

export async function legalStatus(): Promise<LegalStatus> {
  const { data, error } = await supabase.rpc("legal_status");
  if (error) throw new Error(error.message);
  return data as LegalStatus;
}
