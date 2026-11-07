import { motion } from "@octo/design-tokens";

/**
 * How the bottom-bar sections change (founder 07.11: «Главная, План, Сообщения — без анимации, остальные выезжают
 * сбоку»; docs/specs/28 §: «смена раздела — мягкое появление, переход вглубь — выезд сбоку»).
 * A tab change is a short fade (motion.durFast); «Уменьшить движение» — no animation. Pushed screens keep the native
 * slide with the back swipe (app/_layout.tsx Stack, unchanged).
 */
export function tabTransition(reduceMotion: boolean) {
  if (reduceMotion) return { animation: "none" as const };
  return {
    animation: "fade" as const,
    transitionSpec: { animation: "timing" as const, config: { duration: motion.durFast } },
  };
}
