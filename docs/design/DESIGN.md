---
name: GoRix
colors:
  accent: "#E2C15E"          # muted yellow — the one action colour (palette A, founder 21.11)
  on-accent: "#1C1A12"
  accent-edge-light: "#7A6418"
  accent-text-light: "#6E5A12"
  dark-page: "#1F2024"
  dark-bg: "#26282C"         # graphite ground (60 %)
  dark-surface: "#303237"    # cards (30 %)
  dark-ink: "#EEEFF1"
  dark-muted: "#B3B6BE"
  light-page: "#CBCCC6"
  light-bg: "#D6D7D1"        # soft grey ground, never pure white
  light-surface: "#E3E4DE"
  light-ink: "#17181B"
  light-muted: "#42454B"
  pastel-lavender: "#C9C1EC"
  pastel-mint: "#B6DCC6"
  pastel-butter: "#E8DCA0"
  pastel-peach: "#EDC6AC"
typography:
  family: Manrope
  display: { fontSize: 30, weight: 700, letterSpacing: -0.6 }
  title:   { fontSize: 22, weight: 600, letterSpacing: -0.4 }
  heading: { fontSize: 17, weight: 600 }
  body:    { fontSize: 15, weight: 400 }
  caption: { fontSize: 13, weight: 500 }
  micro:   { fontSize: 12, weight: 500 }
rounded:
  card: 22
  inner: 14
  field: 12
  sheet: 28
  button: pill
spacing:
  unit: 4
  screen: 16
  between-cards: 12
  inside-card: 16
sizes:
  button: 40          # touch zone 44
  editor-bottom-row: 56
  field: 44
  list-row: 56
  stat-tile: 88
  object-header-max: 104
---

# GoRix — visual identity for agents

**Source of truth:** values live in `packages/design-tokens/src/index.ts`; behaviour and components in `design/naryad-ds/DESIGN-SYSTEM.md`; layout in `docs/design/LAYOUT-RULES.md`; screens in `docs/design/BUILD-SPEC.md`. This file is the short brief — when it disagrees with those, they win.

## Overview
A field tool for US contractors, used one-handed on a phone, often in the sun. **Calm, dense, graphite.** It should feel like a well-made instrument (Linear, Things, Apple Contacts), not a dashboard template. Compact first: the founder's word is «максимально компактно».

## Colors (60 / 30 / 10)
- **60 % ground** — graphite in dark (`#26282C`), soft grey in light (`#D6D7D1`). Never pure black, never pure white.
- **30 % surfaces and text** — cards one tone lighter; ink 12–14:1, muted text ≥ 6:1.
- **10 % accent** — muted yellow `#E2C15E`, the same in both themes: the one main button, the active tab, the chosen day. In light theme an accent fill without text gets a `#7A6418` hairline; accent as text uses `#6E5A12`.
- **Pastels** (lavender, mint, butter, peach) — only stat tiles, categories and progress bars, always with a word. Never for status.
- **Status** (ok / info / warn / bad / neutral) — tonal plate + icon + word, never colour alone.

## Typography
Manrope, five sizes per screen at most (30 / 22 / 17 / 15 / 13, micro 12). Big titles tracked tight. Money in tabular figures. Follow Dynamic Type: rows grow, tiles drop to one column.

## Layout
Six templates — Overview, List, Object, Editor, Calendar, Sheet. One main action per screen, one filled accent per screen. On an object card the next step sits in the «Сейчас» card near the top (the tab bar stays); a pinned bottom row exists only in editors, compact: total on the left, button on the right. «Back» is a round button top-left. Sections of an object are a horizontal strip, never a column of rows. Lists are grouped rows 56 high, not one card per row. Two short buttons or two fields — side by side. Secondary actions are icons with a VoiceOver label. Nothing on a screen is said twice.

## Motion
Animate by frequency: what people do 100 times a day does not animate. Only `transform` and `opacity`. Ease-out, never ease-in. Springs only after a finger threw or dragged. One haptic per event, together with a visible response. Reduce Motion = softer, not nothing.

## Never
Identical card grids with no hierarchy · decorative gradients or glass · emoji as icons · everything centred · the same radius and shadow on everything · accent on everything · made-up numbers · a second accent button next to the main one.
