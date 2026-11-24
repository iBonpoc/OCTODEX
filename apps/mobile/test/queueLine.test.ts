import { describe, expect, it } from "vitest";
import { queueLine, queueLineKey } from "../src/ui/queueLineRules";

describe("the offline queue's line (#2214) — only while something waits or there is no network", () => {
  it("online with an empty queue: no line", () => {
    expect(queueLine(true, "ok", 0)).toBeNull();
  });
  it("changes wait: «Ждёт отправки · N», an icon with the words", () => {
    const s = queueLine(true, "ok", 3)!;
    expect(s).toMatchObject({ state: "waiting", n: 3, icon: "send" });
    expect(queueLineKey(s)).toBe("ql.waiting");
  });
  it("no network: the line shows even with nothing queued («Нет сети»), and counts what waits", () => {
    expect(queueLineKey(queueLine(false, "offline", 0)!)).toBe("ql.offlineEmpty");
    const s = queueLine(false, "offline", 2)!;
    expect(s).toMatchObject({ state: "offline", n: 2, icon: "wifiOff" });
    expect(queueLineKey(s)).toBe("ql.offline");
  });
  it("the server answers «not now»: not «no network»", () => {
    expect(queueLine(false, "server", 4)).toMatchObject({ state: "server", icon: "alert" });
  });
  it("the server keeps refusing some changes: «Не отправлено · N» with the stuck count", () => {
    expect(queueLine(true, "ok", 5, 1)).toMatchObject({ state: "stuck", n: 1, tone: "bad" });
  });
});
