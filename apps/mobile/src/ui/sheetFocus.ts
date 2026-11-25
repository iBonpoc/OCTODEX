/**
 * #2471 (web): where the focus is when a sheet's layer has gone. react-native-web's Modal gives it back to what opened the sheet
 * by a plain `focus()` as it unmounts — the browser scrolled the page up to that button (the estimate jumped 539 → 0 under the
 * finger, «Итого» unfolded) and took the cursor from a field the person had gone to meanwhile (the quantity a catalog pick opens).
 * `give` — the focus was lost with the sheet (nowhere, or still in it): back to the opener, without scrolling; `keep` — it is
 * on the opener already, or on something the person chose after the sheet began to go: it stays there.
 */
export function focusBack(active: "none" | "sheet" | "opener" | "other"): "give" | "keep" {
  return active === "none" || active === "sheet" ? "give" : "keep";
}
