/** Give the user a CSV (wave 8, reports): the web downloads a file; a phone opens the share sheet with the text (no file system module yet). */
import { Platform, Share } from "react-native";

export async function shareCsv(fileName: string, csv: string): Promise<void> {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: fileName, message: csv });
}
