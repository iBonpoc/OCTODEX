import { badgeState } from "@/data/syncLink";
import type { Link } from "@/data/store";

/**
 * The offline queue's line (#2214, «Островок статуса»; DS §15.3б): a thin line «Ждёт отправки · N» over the tab bar, part of the
 * bar (not a layer over the content) — only while there is something to say: changes wait in the queue (`useStore().queue`) or there
 * is no network. Always an icon and a word, never the colour alone (rule 2). Pure: test/queueLine.test.ts.
 */
export type QueueLineState = "offline" | "server" | "stuck" | "waiting";
export interface QueueLineSay {
  state: QueueLineState;
  n: number;
  icon: "wifiOff" | "alert" | "send";
  tone: "warn" | "bad" | "info";
}

export function queueLine(online: boolean, link: Link, queued: number, stuck = 0): QueueLineSay | null {
  const b = badgeState(online, link, queued, stuck);
  if (!b) return null;
  if (b === "offline") return { state: "offline", n: queued, icon: "wifiOff", tone: "warn" };
  if (b === "server") return { state: "server", n: queued, icon: "alert", tone: "warn" };
  if (b === "stuck") return { state: "stuck", n: stuck, icon: "alert", tone: "bad" };
  return { state: "waiting", n: queued, icon: "send", tone: "info" };
}

/** the dictionary key of the line's words: «Нет сети» alone when nothing waits */
export const queueLineKey = (s: QueueLineSay) =>
  s.state === "offline" ? (s.n > 0 ? "ql.offline" : "ql.offlineEmpty") : s.state === "server" ? "ql.server" : s.state === "stuck" ? "ql.stuck" : "ql.waiting";
