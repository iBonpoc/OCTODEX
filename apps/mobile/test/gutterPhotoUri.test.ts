/** e2e 149 (CI 08.11): a blob: of another page is dead — never loaded; one of this page, a file and an https address are. */
import { describe, expect, it } from "vitest";
import { liveUri, madeHere } from "../src/modules/gutters/photoUri";

describe("liveUri", () => {
  it("a blob: made on this page loads; one from before a reload does not; files and server addresses do", () => {
    madeHere("blob:http://x/1");
    expect(liveUri("blob:http://x/1")).toBe("blob:http://x/1");
    expect(liveUri("blob:http://x/old")).toBeUndefined();
    expect(liveUri("file:///var/photo.jpg")).toBe("file:///var/photo.jpg");
    expect(liveUri("https://cdn/x.jpg")).toBe("https://cdn/x.jpg");
    expect(liveUri(undefined)).toBeUndefined();
    expect(liveUri("blob:http://x/1", new Set())).toBeUndefined();
  });
});
