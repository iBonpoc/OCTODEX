/**
 * #1659: photos and receipts leave the phone's own folders once nothing on the phone needs them. The camera / the
 * library picker puts a copy in the app's cache (`Caches/ImagePicker`), photoShrink.ts writes the smaller one beside it
 * (`Caches/ImageManipulator`); nothing removed them before — a client's house and a receipt stayed on the phone after the
 * sign-out and the account deletion.
 * - The picker's copy goes as soon as the smaller one is saved (photoShrink.ts dropPickedCopy) — only a copy in the app's
 *   own folder, never the person's photo library or any path outside the app's folders (the director, 15.11).
 * - The sweep: a file in these two folders that no record on the phone names (by its file name — the iOS container path
 *   changes with an update; any record: every person's company cache and its kept copies, the demo, the outbox, the
 *   refused changes, the drafts, the modules) and older than SWEEP_MIN_AGE_MS goes. Any record that cannot be read, or a
 *   store whose write to the device failed, and nothing goes (a photo «Повторить» needs is never lost — rule 6).
 * - A sent photo is shown from this phone only (no download from the cloud), so its file stays while a cache names it:
 *   the sign-out (signOutWipe.ts) and the account deletion take the cache, the next sweep the file.
 * The web keeps `blob:` addresses of the page: nothing to sweep. Pure parts: test/localFiles.test.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** the app's own cache folders the picker and the image manipulator write to (iOS and Android: their sources) */
export const APP_PHOTO_DIRS = ["ImagePicker", "ImageManipulator"] as const;
/** a file younger than this is never swept: a photo just taken may not be written to the store yet */
export const SWEEP_MIN_AGE_MS = 10 * 60_000;

/** the last part of a path, decoded ("" for none) */
export function fileName(uri: string): string {
  const path = uri.split(/[?#]/)[0];
  const last = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * `uri` is a file directly inside one of `dirs` (the app's own folders, as `file://…/` URIs): never a path outside them,
 * never with `..`, never a folder's own address, never another scheme (the photo library: `ph://`, `content://`)
 */
export function inAppDir(uri: string, dirs: readonly string[]): boolean {
  if (!uri.startsWith("file://") || /(^|\/)\.\.?(\/|$)/.test(uri.slice("file://".length))) return false;
  return dirs.some((d) => {
    const dir = d.endsWith("/") ? d : `${d}/`;
    if (!uri.startsWith(dir)) return false;
    const rest = uri.slice(dir.length);
    return rest.length > 0 && !rest.includes("/");
  });
}

/** the records that can name a photo file: one of them not readable as JSON calls the sweep off */
const PHOTO_RECORD = /^octo\.(cloud\.v1\.|broken\.|outbox\.|queue\.|db\.|mod\.|drafts\.)/;
export const holdsPhotos = (key: string) => PHOTO_RECORD.test(key);

/**
 * the file names every string in a stored record names. A value that is not JSON (a plain string: the last company, a
 * token, a mark) is read as that string; null — a record that should be JSON and is not: whose files is not known
 */
export function namesIn(raw: string, strict = true): Set<string> | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    if (strict) return null;
    v = raw;
  }
  const out = new Set<string>();
  const walk = (x: unknown, depth: number): void => {
    if (depth > 64) return;
    if (typeof x === "string") {
      if (x.startsWith("file:") || x.includes("/ImagePicker/") || x.includes("/ImageManipulator/")) {
        const n = fileName(x);
        if (n) out.add(n);
      }
    } else if (Array.isArray(x)) x.forEach((y) => walk(y, depth + 1));
    else if (x && typeof x === "object") for (const y of Object.values(x)) walk(y, depth + 1);
  };
  walk(v, 0);
  return out;
}

export interface FoundFile {
  uri: string;
  /** ms since the epoch; null — not known (never swept) */
  modified: number | null;
}
/**
 * a file's time in ms: expo-file-system 58 gives ms on iOS (timeIntervalSince1970 × 1000) and Android (File.lastModified);
 * a value that reads as seconds (an older native side) is taken as seconds — never as a time in 1970 (every file «old»)
 */
export const asMs = (t: number | null): number | null => (t == null || !Number.isFinite(t) || t <= 0 ? null : t < 1e11 ? t * 1000 : t);

/** the files to remove: inside the app's folders, named by no record, old enough (pure) */
export function toSweep(files: readonly FoundFile[], named: ReadonlySet<string>, dirs: readonly string[], now: number, minAge = SWEEP_MIN_AGE_MS): string[] {
  return files
    .filter((f) => {
      const t = asMs(f.modified);
      return inAppDir(f.uri, dirs) && t != null && now - t >= minAge && !named.has(fileName(f.uri));
    })
    .map((f) => f.uri);
}

/** what the sweep needs of the device (tests give stand-ins) */
export interface SweepDeps {
  /** the app's photo folders (`file://…/`), or null: no file system here (the web, a build without it) */
  dirs: () => string[] | null;
  /** the files directly in a folder (none if it does not exist) */
  list: (dir: string) => FoundFile[];
  remove: (uri: string) => void;
  /** the file is on the device (the smaller copy before the picker's goes) */
  exists?: (uri: string) => boolean;
  keys: () => Promise<readonly string[]>;
  read: (key: string) => Promise<string | null>;
  log?: (what: string) => void;
}

/** the photo files made in this run of the app (photoShrink.ts): never swept before the next start */
const madeThisRun = new Set<string>();
export function keptHere(uri: string): void {
  const n = fileName(uri);
  if (n) madeThisRun.add(n);
}

/**
 * The records held only in memory now (the store's data and outbox not written yet): their names count too; null — the
 * store could not write to the device: no sweep at all. Set by the store (setMemoryRecords).
 */
let memory: () => string[] | null = () => [];
export function setMemoryRecords(f: () => string[] | null): () => void {
  memory = f;
  return () => {
    if (memory === f) memory = () => [];
  };
}

/** one sweep; returns how many files went (0 when it was called off). Never throws */
export async function sweepLocalFiles(deps?: SweepDeps, now = Date.now()): Promise<number> {
  try {
    const d = deps ?? deviceDeps();
    const dirs = d.dirs();
    if (!dirs) return 0;
    const inMemory = memory();
    if (inMemory === null) {
      d.log?.("photo files: not swept (the store is not saved on the device)");
      return 0;
    }
    const named = new Set<string>();
    for (const k of await d.keys()) {
      const raw = await d.read(k);
      if (raw == null) continue;
      const names = namesIn(raw, holdsPhotos(k));
      // a record that is not JSON (a broken one kept for a copy): whose files it names is not known — called off
      if (!names) {
        d.log?.(`photo files: not swept (${k} is not readable)`);
        return 0;
      }
      names.forEach((n) => named.add(n));
    }
    for (const raw of inMemory) {
      const names = namesIn(raw);
      if (!names) return 0;
      names.forEach((n) => named.add(n));
    }
    // made in this run: a photo whose «Отменить» is still up, a receipt picked in a form not saved yet — kept till the next run
    madeThisRun.forEach((n) => named.add(n));
    const files = dirs.flatMap((dir) => d.list(dir));
    let gone = 0;
    for (const uri of toSweep(files, named, dirs, now)) {
      try {
        d.remove(uri);
        gone += 1;
      } catch {
        // stays for the next sweep
      }
    }
    return gone;
  } catch {
    return 0; // a read refused (the device busy): the next sweep tries again
  }
}

/** a sweep at a time (the start, a sign-out and a removal may come together); one asked meanwhile runs after it */
let running: Promise<number> | null = null;
let again = false;
export function sweepSoon(delayMs = 0, sweep: () => Promise<number> = () => sweepLocalFiles()): void {
  const go = (): void => {
    if (running) {
      again = true;
      return;
    }
    running = sweep()
      .catch(() => 0)
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          go();
        }
      });
  };
  // no timer for «now» (nothing left running after a wipe: the account deletion's own check)
  if (delayMs <= 0) void Promise.resolve().then(go);
  else setTimeout(go, delayMs);
}

/** expo-file-system on this phone; loaded on first use (the web and the tests in node do not load it) */
function deviceDeps(): SweepDeps {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = (require("react-native") as typeof import("react-native")).Platform.OS;
  const fs = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-file-system") as typeof import("expo-file-system");
  };
  return {
    dirs: () => {
      if (os === "web") return null;
      try {
        const { Directory, Paths } = fs();
        return APP_PHOTO_DIRS.map((n) => new Directory(Paths.cache, n).uri);
      } catch {
        return null;
      }
    },
    list: (dir) => {
      const { Directory, File } = fs();
      const d = new Directory(dir);
      if (!d.exists) return [];
      return d
        .list()
        .filter((x): x is InstanceType<typeof File> => x instanceof File)
        .map((f) => ({ uri: f.uri, modified: f.lastModified ?? f.modificationTime ?? null }));
    },
    remove: (uri) => {
      const { File } = fs();
      new File(uri).delete();
    },
    exists: (uri) => {
      const { File } = fs();
      return new File(uri).exists;
    },
    keys: () => AsyncStorage.getAllKeys(),
    read: (k) => AsyncStorage.getItem(k),
    // eslint-disable-next-line no-console
    log: (what) => console.warn(`[storage] ${what}`),
  };
}

/**
 * photoShrink.ts: the picker's copy goes once the smaller one is saved — only a file in the app's own picker folder (a
 * photo of the person's library or any other path is never touched). Never throws.
 */
export function dropPickedCopy(picked: string, kept: string, deps?: Pick<SweepDeps, "dirs" | "remove" | "exists">): boolean {
  try {
    if (picked === kept || !picked.startsWith("file://")) return false;
    const d = deps ?? deviceDeps();
    const dirs = d.dirs();
    if (!dirs) return false;
    const pickerDir = dirs.filter((u) => /\/ImagePicker\/?$/.test(u));
    if (!inAppDir(picked, pickerDir)) return false;
    // the smaller copy must be on the device first: otherwise the picker's is the only one (never lose the photo)
    if (!d.exists || !d.exists(kept)) return false;
    d.remove(picked);
    return true;
  } catch {
    return false;
  }
}
