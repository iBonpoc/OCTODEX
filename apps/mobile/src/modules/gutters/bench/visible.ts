/**
 * Where «Проверка скорости» (the canvas speed check, /module/gutters/bench) is offered (#1426, design audit 14.11: «служебный стенд
 * показан владельцу»; DS §12.8 — a developer's screen). The founder runs it in Expo Go (spec 33: Expo Go → Модули → Gutters →
 * «Проверка скорости»), a developer in a local build; a company owner in the store build and on the web never sees it. The route
 * itself stays (a link still opens it). Pure: the caller gives the execution environment (expo-constants) and __DEV__.
 */
export function benchOffered(executionEnvironment: string | undefined, dev: boolean): boolean {
  return dev || executionEnvironment === "storeClient";
}

/** the same for this app: Expo Go or a development build; anything that cannot tell (tests) — not offered */
export function benchOfferedHere(): boolean {
  try {
    const dev = typeof __DEV__ !== "undefined" && __DEV__ === true;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const env = (require("expo-constants").default as { executionEnvironment?: string } | undefined)?.executionEnvironment;
    return benchOffered(env, dev);
  } catch {
    return false;
  }
}
