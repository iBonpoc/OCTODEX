import { parseSkin, type Skin } from "./skin";

/** the stored text of the colour-set key (`usePersistentState` writes JSON: `"graphite"`) → the skin; anything else → «Наряд» */
export function readSkin(raw: string | null): Skin {
  if (raw === null) return parseSkin(undefined);
  try {
    return parseSkin(JSON.parse(raw));
  } catch {
    return parseSkin(undefined);
  }
}
