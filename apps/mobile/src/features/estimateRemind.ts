/**
 * «Напомнить» у отправленной сметы (спека 68 В8 (в), предложение согласовано crm/design 26.11; #2997): кнопка видна всегда; срок —
 * настройка компании `leadSettings.remindDays` (по умолчанию 3 дн.), отсчёт от отправки; срок не прошёл — кнопка тихая (`outline`),
 * прошёл — главная залитая и слово «Без ответа · N дн». Только чистое правило: без react-native.
 */
const DAY = 86_400_000;

export type EstimateRemind = { days: number; overdue: boolean };

/** null — не отправленная смета или нет даты отправки */
export function estimateRemind(e: { status: string; sentAt?: string | null }, remindDays: number, now = Date.now()): EstimateRemind | null {
  if (e.status !== "sent" || !e.sentAt) return null;
  const days = Math.max(0, Math.floor((now - new Date(e.sentAt).getTime()) / DAY));
  return { days, overdue: days >= Math.max(1, remindDays) };
}
