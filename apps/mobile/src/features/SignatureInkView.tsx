import { useMemo } from "react";
import { Path } from "react-native-svg";
import { component } from "@octo/design-tokens";
import { inkPaths } from "./signatureInk";

/**
 * The smooth pen's picture (#2215): the stored path `d` (M/L, every point) drawn smoothed, its width from the finger's speed, in a
 * few paths (`signatureInk.ts`). `unit` — canvas pixels per field pixel (the full-screen canvas: its scale `k`). Inside an <Svg>.
 */
export function SignatureInk({ d, color, unit = 1 }: { d: string; color: string; unit?: number }) {
  const paths = useMemo(() => inkPaths(d, component.signStroke, unit), [d, unit]);
  return (
    <>
      {paths.map((p) => (
        <Path key={p.w} d={p.d} stroke={color} strokeWidth={p.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </>
  );
}
