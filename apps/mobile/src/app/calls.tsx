import { CommsScreen } from "@/features/comms/CommsScreen";

/** «Звонки»: a section of «Ещё» (docs/specs/13 §2.1) — pushed over the tabs, so «‹ Ещё» and the back swipe work (docs/specs/28). */
export default function Calls() {
  return <CommsScreen kind="calls" />;
}
