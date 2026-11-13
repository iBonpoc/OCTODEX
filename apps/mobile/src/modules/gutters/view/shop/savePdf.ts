/**
 * The shop drawings as a PDF file (#1349). A phone: expo-print makes the file at the sheet's own page size (11 × 17, or
 * Letter for the reduced print) and the share sheet saves or sends it. The web: the browser's print dialog — the page
 * size is in the document's own @page rule.
 */
import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { saveEstimatePdf } from "@/features/estimatePdf";

export async function saveShopPdf(html: string, fileName: string, pagePt: { width: number; height: number }): Promise<void> {
  if (Platform.OS === "web") return saveEstimatePdf(html, fileName);
  const { uri } = await Print.printToFileAsync({ html, width: pagePt.width, height: pagePt.height, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: fileName });
}
