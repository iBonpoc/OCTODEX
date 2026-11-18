/**
 * #2157 (founder 18.11: «я не могу открыть документы. Нажимаю „Открыть“ — он сразу предлагает их отправить»): on a phone
 * «Открыть» shows the document (expo-print `printAsync` — the system's view of the pages) and never opens the share sheet
 * by itself; «Отправить» makes the file and opens the share sheet, as before. The shop drawings keep their page size.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const printAsync = vi.fn(async (o: unknown) => { calls.push(`print ${JSON.stringify(o)}`); });
const printToFileAsync = vi.fn(async () => { calls.push("file"); return { uri: "file:///x.pdf" }; });
const shareAsync = vi.fn(async () => { calls.push("share"); });
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({ printAsync: (o: unknown) => printAsync(o), printToFileAsync: () => printToFileAsync() }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: () => shareAsync() }));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));

beforeEach(() => {
  calls.length = 0;
});

describe("unit:pdfOpenPreview — «Открыть» shows, «Отправить» sends (a phone)", () => {
  it("«Открыть»: the document's view, no share sheet", async () => {
    const { openPdfPreview } = await import("../src/features/estimatePdf");
    await openPdfPreview("<p>doc</p>", "Doc");
    expect(calls).toEqual(['print {"html":"<p>doc</p>"}']);
  });
  it("«Открыть» the shop drawings: their own page size, margins 0", async () => {
    const { openShopPdf } = await import("../src/modules/gutters/view/shop/savePdf");
    await openShopPdf("<p>s</p>", "Shop", { width: 792, height: 1224 });
    expect(calls).toEqual(['print {"html":"<p>s</p>","width":792,"height":1224,"margins":{"top":0,"bottom":0,"left":0,"right":0}}']);
  });
  it("«Отправить»: the file, then the share sheet — as before", async () => {
    const { saveEstimatePdf } = await import("../src/features/estimatePdf");
    await saveEstimatePdf("<p>doc</p>", "Doc");
    expect(calls).toEqual(["file", "share"]);
  });
});
