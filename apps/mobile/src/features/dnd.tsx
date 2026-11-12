import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptics } from "@/ui/haptics";
import { motion, radius, component, z } from "@octo/design-tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { finePointer, holdConfig } from "@/ui/pointer";

/**
 * Drag & drop per DS motion spec (docs/09-design-system.md «Анимации»):
 * lift scale 1.05, tilt −2°, deep shadow, accent outline; target column highlighted; spring landing.
 * Start: mouse moves 5 px; finger long-press 230 ms (otherwise it is a scroll).
 */
type ViewRef = ComponentRef<typeof View>;
interface Zone {
  id: string;
  ref: ViewRef | null;
  rect?: { x: number; y: number; w: number; h: number };
}
/** A drag ends with a click on web/touch-up; screens ignore presses right after a drop. */
let lastDragEnd = 0;
export const wasJustDragged = () => Date.now() - lastDragEnd < 400;

interface DndCtx {
  register: (id: string, ref: ViewRef | null) => void;
  unregister: (id: string) => void;
  dragFrom: string | null;
  setDragFrom: (id: string | null) => void;
  hover: string | null;
  setHover: (id: string | null) => void;
  measure: () => void;
  hit: (x: number, y: number) => string | null;
  dragging: string | null;
  setDragging: (id: string | null) => void;
}
const Ctx = createContext<DndCtx | null>(null);

export function DndProvider({ children }: { children: ReactNode }) {
  const zones = useRef(new Map<string, Zone>());
  const [hover, setHover] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const register = useCallback((id: string, ref: ViewRef | null) => {
    // Ref callbacks re-run on every render: keep the measured rect, only refresh the node.
    if (ref) {
      const z = zones.current.get(id);
      if (z) z.ref = ref;
      else zones.current.set(id, { id, ref });
    }
  }, []);
  const unregister = useCallback((id: string) => {
    zones.current.delete(id);
  }, []);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const measure = useCallback(() => {
    zones.current.forEach((z) =>
      z.ref?.measureInWindow((x: number, y: number, w: number, h: number) => {
        z.rect = { x, y, w, h };
      }),
    );
  }, []);
  const hit = useCallback((x: number, y: number) => {
    for (const z of zones.current.values()) {
      const r = z.rect;
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return z.id;
    }
    return null;
  }, []);
  const value = useMemo(
    () => ({ register, unregister, dragFrom, setDragFrom, hover, setHover, measure, hit, dragging, setDragging }),
    [register, unregister, dragFrom, hover, measure, hit, dragging],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Zone id the current drag started from (to raise that column above its neighbours). */
export function useDragFrom() {
  return useContext(Ctx)?.dragFrom ?? null;
}

function useDnd() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDnd outside DndProvider");
  return v;
}

/** A column that accepts drops; highlighted while a card hovers it. */
export function DropZone({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { register, unregister, hover, dragging, dragFrom } = useDnd();
  const { c } = useTheme();
  const active = hover === id;
  useEffect(() => () => unregister(id), [id, unregister]);
  return (
    <View
      ref={(r) => register(id, r)}
      style={[
        { borderRadius: radius.card, borderWidth: component.selectedBorder, borderStyle: "dashed", borderColor: "transparent", padding: component.selectedBorder },
        dragging ? { borderColor: c.bd } : null,
        active ? { borderColor: c.acc, backgroundColor: c.surf } : null,
        { zIndex: dragFrom === id ? 2 : 1 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Wrap a card to make it draggable; `onDrop(zoneId)` fires when released over another zone. */
export function Draggable({ id, from, onDrop, children }: { id: string; from: string; onDrop: (zone: string) => void; children: ReactNode }) {
  const { measure, hit, setHover, setDragging, setDragFrom } = useDnd();
  const cfg = useMemo(() => holdConfig(finePointer()), []);
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lift = useSharedValue(0);
  const held = useSharedValue(0);
  const last = useRef<string | null>(null);

  const pan = usePanGesture({
    runOnJS: true,
    // a mouse / pen starts by a move, a finger by a hold (the kind of pointer, not the width of the screen, #1245); one finger
    minDistance: cfg.minDistance,
    activateAfterLongPress: cfg.activateAfterLongPress,
    maxPointers: 1,
    onActivate: () => {
      measure();
      setDragging(id);
      setDragFrom(from);
      held.value = 1;
      // reduced motion: no lift (scale, tilt, shadow); the frame and the ground still show which card is held
      lift.value = reduce ? 0 : withTiming(1, { duration: motion.durSlow });
      haptics.light();
    },
    onUpdate: (e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
      const z = hit(e.absoluteX, e.absoluteY);
      const next = z && z !== from ? z : null;
      if (next !== last.current) {
        last.current = next;
        setHover(next);
        // over another place to drop: one tick of «selection» (DS §15.6)
        if (next) haptics.selection();
      }
    },
    onDeactivate: (e) => {
      const z = e.canceled ? null : last.current;
      last.current = null;
      setHover(null);
      setDragging(null);
      setDragFrom(null);
      lastDragEnd = Date.now();
      held.value = 0;
      if (z) {
        haptics.medium();
        onDrop(z);
      }
      tx.value = reduce ? 0 : withSpring(0, motion.spring);
      ty.value = reduce ? 0 : withSpring(0, motion.spring);
      lift.value = reduce ? 0 : withSpring(0, motion.spring);
    },
  });

  const a = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: 1 + (motion.liftScale - 1) * lift.value },
      { rotate: `${motion.liftTilt * lift.value}deg` },
    ],
    zIndex: held.value > 0.5 ? z.lift : 0,
    shadowOpacity: 0.35 * lift.value,
    shadowRadius: c.shadow.radius,
    shadowOffset: { width: 0, height: component.dragHandle },
    shadowColor: c.shadow.color,
    borderRadius: radius.card,
    borderWidth: component.selectedBorder,
    borderColor: held.value > 0.5 ? c.acc : "transparent",
    // glass is translucent: a lifted card gets the solid page colour so it reads above other cards
    backgroundColor: held.value > 0.5 ? c.bg : "transparent",
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={a}>{children}</Animated.View>
    </GestureDetector>
  );
}
