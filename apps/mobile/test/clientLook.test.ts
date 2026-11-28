import { beforeEach, describe, expect, it, vi } from "vitest";

// #3124 В1: the card's look is a device setting — «Обычный» by default and on any read error, «Линия работы» only when stored
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  },
}));

import { CLIENT_LOOK_KEY, DEFAULT_LOOK, parseClientLook, setClientLook, __resetClientLook } from "@/features/client/clientLook";

describe("clientLook (#3124 В1)", () => {
  beforeEach(() => {
    store.clear();
    __resetClientLook();
  });

  it("«Обычный» is the default; only the stored word «line» turns the line on", () => {
    expect(DEFAULT_LOOK).toBe("plain");
    expect(parseClientLook(null)).toBe("plain");
    expect(parseClientLook("line")).toBe("line");
    expect(parseClientLook("garbage")).toBe("plain");
    expect(parseClientLook("")).toBe("plain");
  });

  it("switching writes one key on the device (not company data, not the sync queue)", async () => {
    setClientLook("line");
    await Promise.resolve();
    expect(store.get(CLIENT_LOOK_KEY)).toBe("line");
    expect([...store.keys()]).toEqual(["octo.client.look.v1"]);
    setClientLook("plain");
    await Promise.resolve();
    expect(store.get(CLIENT_LOOK_KEY)).toBe("plain");
  });
});
