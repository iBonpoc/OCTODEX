/**
 * app.json plus what must not live in git (docs/specs/27-push.md §2): Firebase's google-services.json for Android pushes
 * comes from the EAS file variable GOOGLE_SERVICES_JSON (expo.dev → Environment variables). Without it (Expo Go, the
 * web, a local start) the config is app.json as it is.
 */
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...(config as ExpoConfig),
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
