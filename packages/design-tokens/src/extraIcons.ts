/**
 * Icons the app needs that are not yet in design/naryad-ds/tokens/icons.json.
 * Same grid and stroke (24x24, 1.75, round). To be adopted into the DS (BACKLOG).
 */
export const extraIcons = {
  // ☰ — the app menu (docs/specs/13 §2.2)
  menu: "M4 7h16M4 12h16M4 17h16",
  // a grip to drag a panel by (a canvas toolbar, founder 08.11)
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  // «Развернуть на весь экран» — the signature pad (spec 29)
  expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  navigate: "M3 11l18-8-8 18-2-8z",
  image: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01",
  signature: "M3 17c3-1 4-9 7-9 2 0 0 7 2 7 1.5 0 2-3 3.5-3S17 15 21 15M3 21h18",
  checklist: "M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2 2.3-2.2M4 18l1.2 1.2 2.3-2.2",
  dollar: "M12 3v18M16.5 7.5c-.8-1.3-2.5-2-4.5-2-2.5 0-4 1.3-4 3s1.5 2.6 4 3 4 1.3 4 3-1.5 3-4 3c-2 0-3.7-.7-4.5-2",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  ruler: "M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18",
  sync: "M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.2h.01",
  home2: "M4 21V10l8-6 8 6v11zM9 21v-6h6v6",
  minus: "M5 12h14",
  /* list cards (docs/specs/06-list-cards.md): each fact has its own icon; map ≠ send */
  map: "M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20",
  megaphone: "M3 10v4h3l7 4V6l-7 4zM16 9.5a3 3 0 0 1 0 5M18.5 7a6.5 6.5 0 0 1 0 10M6 14l1 5h3l-1-4",
  clipboard: "M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M8 11h8M8 15h8M8 19h5",
  toolbox: "M3 9h18v10H3zM8 9V6h8v3M3 13.5h18M10 12v3M14 12v3",
  userCheck: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 10-4.5M15 19l2 2 4-4",
  key: "M14.5 14a5 5 0 1 0-4.6-3.1L3 17.8V21h3.2v-2h2v-2h2l1.7-1.7A5 5 0 0 0 14.5 14zM16 8h.01",
  history: "M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3 2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  hash: "M5 9h14M5 15h14M10 3 8 21M16 3l-2 18",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  /** «Скрыта от клиента» (DS 8.3): the eye crossed out */
  eyeOff: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M4 4l16 16",
  box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9",
  truck: "M2 6h12v10H2zM14 9h4l3 3.5V16h-7M5 18.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M15 18.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  cart: "M3 4h2l2.4 11h10.8L20.5 7H6.3M9 20h.01M17 20h.01",
  repeat: "M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5",
  cloud: "M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9.5a4.3 4.3 0 0 1-.5 8.5z",
  lock: "M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  tag: "M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01",
} as const;
