// Eigene Symbole für Werkzeuge und Knöpfe (statt Emojis, die die Funktion oft nicht zeigen).
// 24×24, Linien in currentColor – so passen sie zu jedem Theme. Radier-Varianten bekommen unten
// rechts ein kleines Radiergummi-Abzeichen, Verdecken/Aufdecken ein Auge.

const P = {
  // Auswählen und verschieben: Mauszeiger
  select: '<path d="M5 3l13 7-5.5 1.6L10 17z" fill="currentColor" stroke-linejoin="round"/><path d="M12.5 11.8l4 6.2"/>',
  // Messen: Lineal
  measure: '<rect x="2.5" y="8" width="19" height="8" rx="1.5" transform="rotate(-30 12 12)"/><path d="M7.6 12.2l1.2 2M10.6 10.5l1.6 2.8M13.6 8.8l1.2 2M16.6 7l1.6 2.8"/>',
  // Ping: Zielpunkt mit Wellen
  ping: '<circle cx="12" cy="12" r="2.4" fill="currentColor"/><circle cx="12" cy="12" r="6"/><path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5M2.5 12A9.5 9.5 0 0 1 12 2.5" opacity="0.6"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  // Freihand: Stift mit Linie
  line: '<path d="M3 20c3-1 4-4 7-4"/><path d="M14.5 4.5l5 5L11 18l-5 1 1-5z" stroke-linejoin="round"/>',
  // Radierer
  eraser: '<path d="M14.5 4l6 6-9 9H7l-3.5-3.5z" stroke-linejoin="round"/><path d="M9 9.5l6 6M7 19h13"/>',
  // Objekt: Kiste
  object: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z" stroke-linejoin="round"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  // Zauberschablone: Wirkungsbereich mit Funke
  template: '<circle cx="12" cy="13" r="7.5" stroke-dasharray="3 2.5"/><path d="M12 9.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="currentColor" stroke-linejoin="round"/>',
  // Nebel des Krieges: gestricheltes Feld bzw. Pinsel, mit Auge (aufdecken) oder durchgestrichenem Auge (verdecken)
  'fog-rect': '<rect x="3" y="4" width="13" height="10" rx="1" stroke-dasharray="2.5 2"/>',
  'fog-brush': '<path d="M3.5 13.5c2-3 5-1 6.5-3.5s3-4 5.5-3" stroke-width="3.2" opacity="0.55"/>',
  eye: '<path d="M12 16.5c2.7 0 4.6 1.6 5.6 3-1 1.4-2.9 3-5.6 3s-4.6-1.6-5.6-3c1-1.4 2.9-3 5.6-3z" transform="translate(4 -1)"/><circle cx="16" cy="18.5" r="1.3" fill="currentColor"/>',
  'eye-off': '<path d="M12 16.5c2.7 0 4.6 1.6 5.6 3-1 1.4-2.9 3-5.6 3s-4.6-1.6-5.6-3c1-1.4 2.9-3 5.6-3z" transform="translate(4 -1)"/><path d="M11.5 22.5l9-8"/>',
  // Licht: Laterne mit Strahlen
  light: '<path d="M9 7h6l1 9H8z" stroke-linejoin="round"/><path d="M10 7V5h4v2M7.5 19h9M12 10.5v3"/><path d="M4 9l-2-1M20 9l2-1M4 14H2M20 14h2" opacity="0.7"/>',
  // Nebel/Wolken
  cloud: '<path d="M7 18h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 18z" stroke-linejoin="round"/><path d="M3 21h12" opacity="0.6"/>',
  // Blitzlicht: greller Lichtblitz (Stern mit Kranz), kein Strich-Blitz
  flash: '<path d="M12 2.5l1.6 6.2 6-2.4-4 5.2 5.9 2.5-6.4.7.6 6.4L12 15.8l-3.7 5.3.6-6.4-6.4-.7 5.9-2.5-4-5.2 6 2.4z" fill="currentColor" fill-opacity="0.25" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  // Regen
  rain: '<path d="M6.5 13h10a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.2 7 3 3 0 0 0 6.5 13z" stroke-linejoin="round"/><path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3M10 20l-.6 1.6M14 20l-.6 1.6"/>',
  // Würfel: W20
  dice: '<path d="M12 2.5l8.5 5v9L12 21.5l-8.5-5v-9z" stroke-linejoin="round"/><path d="M12 2.5L7.5 10h9zM7.5 10L3.5 16.5M16.5 10l4 6.5M7.5 10L12 21.5 16.5 10" stroke-linejoin="round"/>',
  chat: '<path d="M4 5h16v10H10l-4 4v-4H4z" stroke-linejoin="round"/><path d="M8 9h8M8 12h5"/>',
  // Weltkarte: gefaltete Karte mit Kompass-Stern
  world: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" opacity="0.6"/>',
  // Karte ein-/ausblenden: Karte mit Schrägstrich
  'map-off': '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" stroke-linejoin="round" opacity="0.75"/><path d="M3 3l18 18" stroke-width="2.2"/>',
  // Tagebuch: Buch mit Lesezeichen
  journal: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" stroke-linejoin="round"/><path d="M5 18a2 2 0 0 1 2-2h11"/><path d="M13 4v6l1.5-1.2L16 10V4" fill="currentColor" fill-opacity="0.35"/>',
};

// kleines Radiergummi unten rechts (für „… radieren“)
const ERASER_BADGE = '<g transform="translate(13 13) scale(0.46)"><rect x="-2" y="-2" width="26" height="26" rx="6" fill="var(--icon-badge-bg, #fff)" stroke="none"/><path d="M14.5 4l6 6-9 9H7l-3.5-3.5z" fill="var(--icon-badge, #d33a4a)" stroke="var(--icon-badge, #d33a4a)" stroke-linejoin="round"/><path d="M9 9.5l6 6" stroke="#fff"/></g>';

const COMPOSED = {
  'fog-rect-reveal': P['fog-rect'] + P.eye,
  'fog-rect-hide': P['fog-rect'] + P['eye-off'],
  'fog-brush-reveal': P['fog-brush'] + P.eye,
  'fog-brush-hide': P['fog-brush'] + P['eye-off'],
  'light-brush': P.light,
  'light-eraser': P.light + ERASER_BADGE,
  'cloud-brush': P.cloud,
  'cloud-eraser': P.cloud + ERASER_BADGE,
  'bolt-brush': P.flash,
  'bolt-eraser': P.flash + ERASER_BADGE,
};

/** SVG-Symbol als DOM-Element (aria-hidden; die Beschriftung kommt vom Knopf). */
export function icon(name, size = 22) {
  const body = COMPOSED[name] || P[name];
  if (!body) return document.createTextNode('?');
  const wrap = document.createElement('span');
  wrap.className = `ico ico-${name}`;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${body}</svg>`;
  return wrap;
}

export const ICON_NAMES = [...Object.keys(P), ...Object.keys(COMPOSED)];
