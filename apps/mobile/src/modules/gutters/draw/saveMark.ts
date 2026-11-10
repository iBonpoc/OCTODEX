/**
 * The save mark at the top of the canvas (founder 09.11, #507: «непонятно, что это за надпись… чтобы было типа кнопка
 * сохранения»): an icon, not words — a cloud with a tick (saved and sent), a cloud with an arrow (saved, going out), a
 * phone (saved on the phone only: no connection, it goes out later). Nothing before the drawing is first saved. A tap
 * says it in words (a toast). Pure: what is known on the phone in, the mark out.
 */
export type SaveMark = "none" | "sent" | "sending" | "phone";

export function saveMark(o: { saved: boolean; online: boolean; pending: number }): SaveMark {
  if (!o.saved) return "none";
  if (!o.pending) return "sent";
  return o.online ? "sending" : "phone";
}

export const SAVE_ICON = { sent: "cloudCheck", sending: "cloudUp", phone: "phone" } as const;
