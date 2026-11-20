'use strict';
/**
 * Datenmodell, Aktionen (mit Rechteprüfung) und rollenabhängige Sichten.
 *
 * Der Server hält den einzigen gültigen Spielstand. Clients schicken nur
 * Aktionen ("Figur 3 nach x/y"); der Server prüft, ob die Rolle das darf,
 * ändert den Zustand und verteilt danach eine passend gefilterte Kopie.
 * Was ein Spieler nicht sehen darf, verlässt den Server gar nicht erst.
 */
const crypto = require('crypto');
const CATALOG = require('../shared/conditions.json');
const { rollDice } = require('./dice');

const SLOT_LEVELS = 9;
const STATE_VERSION = 2;
const MAX_SEATS = 20;
const DICE_LOG = 100;
let SEAT_COUNT = 5;

/** Anzahl der Spielerplätze (Vorschlag 13): Standard 5, bis zu 20, im Spiel änderbar. */
function configureSeats(n) { SEAT_COUNT = Math.max(1, Math.min(MAX_SEATS, Math.round(Number(n) || 5))); }
const seatCount = () => SEAT_COUNT;

const newId = (prefix = '') => prefix + crypto.randomBytes(5).toString('hex');
const CONDITION_KEYS = new Map(CATALOG.conditions.map((c) => [c.key, c]));

// ---------- Hilfsfunktionen zum sicheren Übernehmen von Werten ----------

const clampInt = (v, min, max, fallback = 0) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v, maxLen = 200) => (typeof v === 'string' ? v.slice(0, maxLen) : '');
const bool = (v) => v === true;
const color = (v, fallback) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
const optSeat = (v) => (v === null || v === undefined || v === '' ? null : clampInt(v, 1, SEAT_COUNT, null));
const LONG_TEXT = 100_000;

function seatList(v) {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  return [...new Set(v.map((s) => clampInt(s, 1, SEAT_COUNT, 0)).filter(Boolean))].sort((a, b) => a - b);
}

function sanitizeConditions(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map((c) => {
    const known = CONDITION_KEYS.get(c && c.key);
    if (known) return { id: str(c.id, 40) || newId('z_'), key: known.key, label: known.label, color: known.color };
    const label = str(c && c.label, 30).trim();
    if (!label) return null;
    return { id: str(c.id, 40) || newId('z_'), key: 'custom', label, color: color(c.color, '#888888') };
  }).filter(Boolean);
}

// ---------- Fabriken ----------

function emptySlots() {
  return Array.from({ length: SLOT_LEVELS }, (_, i) => ({ level: i + 1, max: 0, used: 0 }));
}

function newCharacter(seat) {
  return {
    id: newId('c_'),
    seat,
    name: `Charakter ${seat}`,
    portraitAssetId: null,
    hp: { cur: 10, max: 10, temp: 0 },
    deathSaves: { success: 0, fail: 0 },
    conditions: [],
    stats: [{ id: newId('s_'), label: 'RK', value: '10' }],
    slots: emptySlots(),
    counters: [],
    inventory: '',
    privateNotes: '',
  };
}

function newNpc(name = 'Neuer NPC') {
  return {
    id: newId('n_'),
    name,
    portraitAssetId: null,
    note: '',
    hp: { cur: 10, max: 10, temp: 0 },
    dead: false,
    deathSaves: { success: 0, fail: 0 },
    conditions: [],
    stats: [{ id: newId('s_'), label: 'RK', value: '10' }],
    slots: emptySlots(),
    counters: [],
  };
}

function newScene(name = 'Neue Szene') {
  return {
    id: newId('sc_'),
    name,
    background: null, // { assetId }
    mapScale: 1,
    grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, color: '#000000', opacity: 0.35, feet: 5, snap: true },
    night: false,
    notes: '',
    fog: { enabled: false, shapes: [] },
    drawings: [],
    tokens: [],
  };
}

function createInitialState() {
  const first = newScene('Erste Szene');
  return {
    version: STATE_VERSION,
    activeSceneId: first.id,
    seatScenes: {},
    settings: { pin: '', seatCount: SEAT_COUNT },
    scenes: [first],
    assets: [],
    seats: Array.from({ length: SEAT_COUNT }, (_, i) => ({ seat: i + 1, playerName: '', claimToken: null })),
    characters: Array.from({ length: SEAT_COUNT }, (_, i) => newCharacter(i + 1)),
    npcs: [],
    initiative: { entries: [], currentId: null },
    party: { notes: '', xp: 0, gold: '', date: '' },
    diceLog: [],
    dmNotes: '',
  };
}

/** Bringt einen geladenen (evtl. älteren/unvollständigen) Zustand in Form. */
function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return createInitialState();
  // Ein gespeicherter Stand bringt seine Platzanzahl mit.
  if (raw.settings && raw.settings.seatCount) configureSeats(raw.settings.seatCount);
  const base = createInitialState();
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  const sceneDefaults = newScene();
  s.scenes = (Array.isArray(raw.scenes) && raw.scenes.length ? raw.scenes : base.scenes).map((sc) => ({
    ...sceneDefaults, ...sc,
    grid: { ...sceneDefaults.grid, ...(sc.grid || {}) },
    fog: { enabled: !!(sc.fog && sc.fog.enabled), shapes: Array.isArray(sc.fog && sc.fog.shapes) ? sc.fog.shapes : [] },
    drawings: Array.isArray(sc.drawings) ? sc.drawings : [],
    tokens: (Array.isArray(sc.tokens) ? sc.tokens : []).map((t) => ({ ...t, visibleTo: t.visibleTo ?? null, conditions: Array.isArray(t.conditions) ? t.conditions : [] })),
  }));
  if (!s.scenes.some((sc) => sc.id === s.activeSceneId)) s.activeSceneId = s.scenes[0].id;
  s.seatScenes = {};
  for (const [k, v] of Object.entries(raw.seatScenes || {})) {
    const seat = Number(k);
    if (seat >= 1 && seat <= SEAT_COUNT && s.scenes.some((sc) => sc.id === v)) s.seatScenes[seat] = v;
  }
  s.assets = Array.isArray(raw.assets) ? raw.assets : [];
  s.seats = base.seats.map((b) => ({ ...b, ...((raw.seats || []).find((x) => x.seat === b.seat) || {}) }));
  s.characters = base.characters.map((b) => {
    const c = (raw.characters || []).find((x) => x.seat === b.seat);
    return c ? { ...b, ...c, slots: normalizeSlots(c.slots), deathSaves: { ...b.deathSaves, ...(c.deathSaves || {}) }, conditions: sanitizeConditions(c.conditions) } : b;
  });
  s.npcs = (Array.isArray(raw.npcs) ? raw.npcs : []).map((n) => {
    const d = newNpc();
    return { ...d, ...n, slots: normalizeSlots(n.slots), deathSaves: { ...d.deathSaves, ...(n.deathSaves || {}) }, conditions: sanitizeConditions(n.conditions) };
  });
  // Initiative: ältere Stände hatten einen Index statt einer Id.
  const ini = raw.initiative || {};
  const entries = (Array.isArray(ini.entries) ? ini.entries : []).map((e) => ({ value: null, visibility: 'auto', ...e }));
  let currentId = ini.currentId || null;
  if (!currentId && typeof ini.current === 'number' && entries[ini.current]) currentId = entries[ini.current].id;
  s.initiative = { entries, currentId };
  s.party = { ...base.party, ...(raw.party || {}) };
  s.diceLog = Array.isArray(raw.diceLog) ? raw.diceLog.slice(-DICE_LOG) : [];
  s.settings.seatCount = SEAT_COUNT;
  s.version = STATE_VERSION;
  return s;
}

/** Plätze im laufenden Spiel ändern. Belegte Plätze werden nie entfernt. */
function changeSeatCount(state, wanted) {
  const n = Math.max(1, Math.min(MAX_SEATS, Math.round(Number(wanted) || 0)));
  if (n < state.seats.length) {
    const busy = state.seats.filter((s) => s.seat > n && s.claimToken).map((s) => s.seat);
    if (busy.length) throw new ActionError(`Platz ${busy.join(', ')} ist noch belegt. Erst freigeben, dann verkleinern.`);
    const removedChars = new Set(state.characters.filter((c) => c.seat > n).map((c) => c.id));
    state.seats = state.seats.filter((s) => s.seat <= n);
    state.characters = state.characters.filter((c) => c.seat <= n);
    state.initiative.entries = state.initiative.entries.filter((e) => !(e.kind === 'character' && removedChars.has(e.refId)));
    for (const seat of Object.keys(state.seatScenes)) if (Number(seat) > n) delete state.seatScenes[seat];
    for (const sc of state.scenes) for (const t of sc.tokens) {
      if (t.ownerSeat > n) t.ownerSeat = null;
      if (Array.isArray(t.visibleTo)) t.visibleTo = t.visibleTo.filter((x) => x <= n);
      if (removedChars.has(t.refId)) { t.refId = null; t.kind = 'marker'; }
    }
    fixCurrent(state);
  }
  for (let seat = state.seats.length + 1; seat <= n; seat++) {
    state.seats.push({ seat, playerName: '', claimToken: null });
    state.characters.push(newCharacter(seat));
  }
  configureSeats(n);
  state.settings.seatCount = n;
  return n;
}

function normalizeSlots(slots) {
  const out = emptySlots();
  if (Array.isArray(slots)) for (const sl of slots) {
    const t = out.find((o) => o.level === sl.level);
    if (t) { t.max = clampInt(sl.max, 0, 99); t.used = clampInt(sl.used, 0, t.max); }
  }
  return out;
}

// ---------- Sichtbarkeit ----------

/** Welche Szene sieht ein Platz? (Vorschlag 8: eine Szene pro Spieler) */
function sceneIdForSeat(state, seat) {
  return state.seatScenes[seat] || state.activeSceneId;
}

function inShape(sh, x, y) {
  switch (sh.type) {
    case 'all': return true;
    case 'rect': return x >= sh.x && x <= sh.x + sh.w && y >= sh.y && y <= sh.y + sh.h;
    case 'circle': return Math.hypot(x - sh.x, y - sh.y) <= sh.r;
    case 'stroke': {
      const p = sh.points || [];
      if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= sh.r;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const [ax, ay, bx, by] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
        const dx = bx - ax; const dy = by - ay;
        const len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= sh.r) return true;
      }
      return false;
    }
    default: return false;
  }
}

/** Ist ein Punkt im Fog of War aufgedeckt? Formen werden der Reihe nach angewendet. */
function pointRevealed(fog, x, y) {
  if (!fog || !fog.enabled) return true;
  let visible = false;
  for (const sh of fog.shapes) if (inShape(sh, x, y)) visible = sh.op === 'reveal';
  return visible;
}

/** Darf dieser Platz die Figur sehen? (versteckt, Sicht pro Spieler, Fog of War) */
function tokenVisibleToSeat(scene, t, seat) {
  if (t.hidden) return false;
  if (Array.isArray(t.visibleTo) && !t.visibleTo.includes(seat)) return false;
  if (t.ownerSeat === seat) return true; // eigene Figuren sieht man immer
  return pointRevealed(scene.fog, t.x, t.y);
}

function drawingVisibleToSeat(scene, d, seat) {
  if (d.hidden) return false;
  if (d.ownerSeat === seat) return true;
  return pointRevealed(scene.fog, d.x, d.y);
}

/** Ist ein Initiative-Eintrag für den Platz sichtbar? (Stufe 0: Leck geschlossen) */
function entryVisibleToSeat(state, e, seat) {
  if (e.kind === 'character') return true;
  if (e.visibility === 'show') return true;
  if (e.visibility === 'hide') return false;
  const members = e.kind === 'group' ? e.refIds || [] : [e.refId];
  const scene = state.scenes.find((s) => s.id === sceneIdForSeat(state, seat));
  return scene.tokens.some((t) => t.kind === 'npc' && members.includes(t.refId) && tokenVisibleToSeat(scene, t, seat));
}

// ---------- Patches für Charakterwerte (HP, Slots, Zähler, Werte) ----------

function applySheetPatch(target, patch, { allowPrivateNotes, allowInventory = true, allowNote = false }) {
  if ('name' in patch) target.name = str(patch.name, 80) || target.name;
  if ('portraitAssetId' in patch) target.portraitAssetId = patch.portraitAssetId ? str(patch.portraitAssetId, 60) : null;
  if (patch.hp && typeof patch.hp === 'object') {
    const hp = { ...target.hp };
    if ('max' in patch.hp) hp.max = clampInt(patch.hp.max, 0, 9999);
    if ('cur' in patch.hp) hp.cur = clampInt(patch.hp.cur, 0, 9999);
    if ('temp' in patch.hp) hp.temp = clampInt(patch.hp.temp, 0, 9999);
    if (hp.cur > hp.max) hp.cur = hp.max;
    setHp(target, hp);
  }
  if (patch.deathSaves && typeof patch.deathSaves === 'object') {
    target.deathSaves = {
      success: clampInt(patch.deathSaves.success, 0, 3, target.deathSaves.success),
      fail: clampInt(patch.deathSaves.fail, 0, 3, target.deathSaves.fail),
    };
  }
  if ('dead' in patch && 'dead' in target) target.dead = bool(patch.dead);
  if (Array.isArray(patch.conditions)) target.conditions = sanitizeConditions(patch.conditions);
  if (Array.isArray(patch.stats)) {
    target.stats = patch.stats.slice(0, 30).map((st) => ({ id: str(st.id, 40) || newId('s_'), label: str(st.label, 40), value: str(st.value, 40) }));
  }
  if (Array.isArray(patch.slots)) target.slots = normalizeSlots(patch.slots);
  if (Array.isArray(patch.counters)) {
    target.counters = patch.counters.slice(0, 30).map((c) => {
      const max = clampInt(c.max, 0, 9999);
      return { id: str(c.id, 40) || newId('k_'), name: str(c.name, 40), max, cur: clampInt(c.cur, 0, max) };
    });
  }
  if (allowInventory && 'inventory' in patch) target.inventory = str(patch.inventory, LONG_TEXT);
  if (allowPrivateNotes && 'privateNotes' in patch) target.privateNotes = str(patch.privateNotes, LONG_TEXT);
  if (allowNote && 'note' in patch) target.note = str(patch.note, LONG_TEXT);
}

/** HP setzen; wer wieder über 0 kommt, verliert Todesrettungswürfe und "tot". */
function setHp(target, hp) {
  const wasDown = target.hp.cur <= 0;
  target.hp = hp;
  if (wasDown && hp.cur > 0) {
    target.deathSaves = { success: 0, fail: 0 };
    if ('dead' in target) target.dead = false;
  }
}

/** Schaden (zuerst temporäre HP) oder Heilung (Vorschlag 5). */
function applyHpChange(target, amount, mode) {
  const n = clampInt(Math.abs(amount), 0, 9999);
  const hp = { ...target.hp };
  if (mode === 'damage') {
    const fromTemp = Math.min(hp.temp, n);
    hp.temp -= fromTemp;
    hp.cur = Math.max(0, hp.cur - (n - fromTemp));
  } else if (mode === 'heal') {
    hp.cur = Math.min(hp.max, hp.cur + n);
  } else if (mode === 'temp') {
    hp.temp = Math.max(hp.temp, n);
  }
  setHp(target, hp);
}

// ---------- Figuren, Zeichnungen, Nebel ----------

function sanitizeTokenPatch(patch) {
  const out = {};
  if ('x' in patch) out.x = num(patch.x);
  if ('y' in patch) out.y = num(patch.y);
  if ('size' in patch) out.size = Math.min(10, Math.max(0.25, num(patch.size, 1)));
  if ('label' in patch) out.label = str(patch.label, 6);
  if ('name' in patch) out.name = str(patch.name, 60);
  if ('assetId' in patch) out.assetId = patch.assetId ? str(patch.assetId, 60) : null;
  if ('ownerSeat' in patch) out.ownerSeat = optSeat(patch.ownerSeat);
  if ('hidden' in patch) out.hidden = bool(patch.hidden);
  if ('visibleTo' in patch) out.visibleTo = seatList(patch.visibleTo);
  if ('kind' in patch) out.kind = ['player', 'npc', 'marker'].includes(patch.kind) ? patch.kind : 'marker';
  if ('refId' in patch) out.refId = patch.refId ? str(patch.refId, 60) : null;
  if ('color' in patch) out.color = color(patch.color, '#8a6d3b');
  if (Array.isArray(patch.conditions)) out.conditions = sanitizeConditions(patch.conditions);
  return out;
}

const DRAWING_TYPES = ['rect', 'ellipse', 'line', 'image', 'template'];
const TEMPLATE_SHAPES = ['circle', 'cone', 'line', 'square'];

function sanitizeDrawingPatch(p) {
  const out = {};
  if ('type' in p) out.type = DRAWING_TYPES.includes(p.type) ? p.type : 'rect';
  for (const k of ['x', 'y']) if (k in p) out[k] = num(p[k]);
  for (const k of ['w', 'h']) if (k in p) out[k] = Math.min(20000, Math.max(1, num(p[k], 50)));
  if ('rotation' in p) out.rotation = ((num(p.rotation) % 360) + 360) % 360;
  if (Array.isArray(p.points)) out.points = p.points.slice(0, 4000).map((v) => Math.round(num(v) * 10) / 10);
  if ('stroke' in p) out.stroke = color(p.stroke, '#2b2118');
  if ('fill' in p) out.fill = p.fill === null ? null : color(p.fill, '#8a6d3b');
  if ('strokeWidth' in p) out.strokeWidth = Math.min(60, Math.max(0, num(p.strokeWidth, 3)));
  if ('opacity' in p) out.opacity = Math.min(1, Math.max(0.05, num(p.opacity, 1)));
  if ('assetId' in p) out.assetId = p.assetId ? str(p.assetId, 60) : null;
  if ('hidden' in p) out.hidden = bool(p.hidden);
  if ('locked' in p) out.locked = bool(p.locked);
  if ('label' in p) out.label = str(p.label, 60);
  if ('shape' in p) out.shape = TEMPLATE_SHAPES.includes(p.shape) ? p.shape : 'circle';
  if ('sizeFt' in p) out.sizeFt = Math.min(500, Math.max(5, num(p.sizeFt, 20)));
  return out;
}

function sanitizeFogShape(sh) {
  const type = ['rect', 'circle', 'stroke'].includes(sh && sh.type) ? sh.type : null;
  if (!type) throw new ActionError('Unbekannte Nebelform');
  const out = { id: newId('f_'), op: sh.op === 'hide' ? 'hide' : 'reveal', type };
  if (type === 'rect') {
    const x = num(sh.x); const y = num(sh.y); const w = num(sh.w); const h = num(sh.h);
    Object.assign(out, { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) });
  } else if (type === 'circle') {
    Object.assign(out, { x: num(sh.x), y: num(sh.y), r: Math.max(1, num(sh.r, 50)) });
  } else {
    out.points = (Array.isArray(sh.points) ? sh.points : []).slice(0, 4000).map((v) => Math.round(num(v)));
    out.r = Math.max(2, Math.min(1000, num(sh.r, 40)));
  }
  return out;
}

/** Grober Gesundheitszustand, den Spieler statt genauer HP sehen (N8). */
function roughCondition(hp, dead = false) {
  if (!hp || hp.max <= 0) return 'unbekannt';
  if (hp.cur <= 0) return dead ? 'tot' : 'am Boden';
  if (hp.cur >= hp.max) return 'unverletzt';
  if (hp.cur > hp.max / 2) return 'angeschlagen';
  return 'schwer verletzt';
}

// ---------- Aktionen ----------

class ActionError extends Error {}
const deny = (msg = 'Keine Berechtigung') => { throw new ActionError(msg); };
const must = (cond, msg = 'Nicht gefunden') => { if (!cond) throw new ActionError(msg); };

/**
 * Wendet eine Aktion an. `who` ist { role: 'dm' } oder { role: 'player', seat }.
 * Gibt ein Ergebnisobjekt zurück. Wirft ActionError bei Fehlern.
 */
function applyAction(state, who, action) {
  if (!action || typeof action.type !== 'string') throw new ActionError('Ungültige Aktion');
  const isDM = who.role === 'dm';
  const findScene = (id) => state.scenes.find((s) => s.id === id);
  const findToken = (scene, id) => scene && scene.tokens.find((t) => t.id === id);
  const findDrawing = (scene, id) => scene && scene.drawings.find((d) => d.id === id);
  const findEntity = (kind, id) => (kind === 'character' ? state.characters : state.npcs).find((x) => x.id === id);

  switch (action.type) {
    // ---------- Szenen ----------
    case 'scene.create': {
      if (!isDM) deny();
      const sc = newScene(str(action.name, 80) || 'Neue Szene');
      state.scenes.push(sc);
      return { id: sc.id };
    }
    case 'scene.update': {
      if (!isDM) deny();
      const sc = findScene(action.id); must(sc);
      const p = action.patch || {};
      if ('name' in p) sc.name = str(p.name, 80) || sc.name;
      if ('notes' in p) sc.notes = str(p.notes, LONG_TEXT);
      if ('night' in p) sc.night = bool(p.night);
      if ('mapScale' in p) sc.mapScale = Math.min(10, Math.max(0.05, num(p.mapScale, 1)));
      if ('background' in p) sc.background = p.background && p.background.assetId ? { assetId: str(p.background.assetId, 60) } : null;
      if (p.grid && typeof p.grid === 'object') {
        const g = { ...sc.grid };
        if ('enabled' in p.grid) g.enabled = bool(p.grid.enabled);
        if ('snap' in p.grid) g.snap = bool(p.grid.snap);
        if ('size' in p.grid) g.size = Math.min(500, Math.max(10, num(p.grid.size, 70)));
        if ('feet' in p.grid) g.feet = Math.min(100, Math.max(1, num(p.grid.feet, 5)));
        if ('offsetX' in p.grid) g.offsetX = num(p.grid.offsetX);
        if ('offsetY' in p.grid) g.offsetY = num(p.grid.offsetY);
        if ('opacity' in p.grid) g.opacity = Math.min(1, Math.max(0, num(p.grid.opacity, 0.35)));
        if ('color' in p.grid) g.color = color(p.grid.color, g.color);
        sc.grid = g;
      }
      return {};
    }
    case 'scene.duplicate': {
      if (!isDM) deny();
      const sc = findScene(action.id); must(sc);
      const copy = JSON.parse(JSON.stringify(sc));
      copy.id = newId('sc_');
      copy.name = `${sc.name} (Kopie)`;
      copy.tokens.forEach((t) => { t.id = newId('t_'); });
      copy.drawings.forEach((d) => { d.id = newId('d_'); });
      state.scenes.splice(state.scenes.indexOf(sc) + 1, 0, copy);
      return { id: copy.id };
    }
    case 'scene.delete': {
      if (!isDM) deny();
      if (state.scenes.length <= 1) throw new ActionError('Die letzte Szene kann nicht gelöscht werden');
      const i = state.scenes.findIndex((s) => s.id === action.id); must(i >= 0);
      state.scenes.splice(i, 1);
      if (state.activeSceneId === action.id) state.activeSceneId = state.scenes[0].id;
      for (const [seat, sid] of Object.entries(state.seatScenes)) if (sid === action.id) delete state.seatScenes[seat];
      return {};
    }
    case 'scene.reorder': {
      if (!isDM) deny();
      const ids = Array.isArray(action.ids) ? action.ids : [];
      const sorted = ids.map((id) => findScene(id)).filter(Boolean);
      if (sorted.length !== state.scenes.length) throw new ActionError('Reihenfolge unvollständig');
      state.scenes = sorted;
      return {};
    }
    case 'scene.activate': {
      // "Live schalten": alle Spieler sehen diese Szene (getrennte Gruppen werden zusammengeführt).
      if (!isDM) deny();
      must(findScene(action.id));
      state.activeSceneId = action.id;
      state.seatScenes = {};
      return {};
    }
    case 'seat.setScene': {
      // Vorschlag 8: einzelne Spieler an einen anderen Ort schicken.
      if (!isDM) deny();
      const seat = optSeat(action.seat); must(seat, 'Platz unbekannt');
      if (!action.sceneId || action.sceneId === state.activeSceneId) delete state.seatScenes[seat];
      else { must(findScene(action.sceneId)); state.seatScenes[seat] = action.sceneId; }
      return {};
    }

    // ---------- Nebel (Vorschlag 7) ----------
    case 'fog.update': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      if ('enabled' in (action.patch || {})) sc.fog.enabled = bool(action.patch.enabled);
      return {};
    }
    case 'fog.add': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      if (sc.fog.shapes.length >= 2000) throw new ActionError('Zu viele Nebelformen, bitte „Alles aufdecken“ oder „Alles verdecken“ nutzen');
      sc.fog.shapes.push(sanitizeFogShape(action.shape));
      sc.fog.enabled = true;
      return {};
    }
    case 'fog.undo': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      sc.fog.shapes.pop();
      return {};
    }
    case 'fog.reset': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      sc.fog.shapes = action.mode === 'revealAll' ? [{ id: newId('f_'), op: 'reveal', type: 'all' }] : [];
      sc.fog.enabled = true;
      return {};
    }

    // ---------- Figuren ----------
    case 'token.create': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      const t = {
        id: newId('t_'), x: 0, y: 0, size: 1, label: '', name: '', assetId: null,
        ownerSeat: null, hidden: false, visibleTo: null, kind: 'marker', refId: null, color: '#8a6d3b', conditions: [],
        ...sanitizeTokenPatch(action.token || {}),
      };
      sc.tokens.push(t);
      return { id: t.id };
    }
    case 'token.update': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); const t = findToken(sc, action.id); must(t);
      Object.assign(t, sanitizeTokenPatch(action.patch || {}));
      return {};
    }
    case 'token.updateMany': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      const patch = sanitizeTokenPatch(action.patch || {});
      for (const id of action.ids || []) { const t = findToken(sc, id); if (t) Object.assign(t, patch); }
      return {};
    }
    case 'token.move': {
      const sc = findScene(action.sceneId); const t = findToken(sc, action.id); must(t);
      if (!isDM) {
        // Spieler: nur eigene, sichtbare Figuren in der eigenen Szene.
        if (sc.id !== sceneIdForSeat(state, who.seat) || t.ownerSeat !== who.seat || !tokenVisibleToSeat(sc, t, who.seat)) deny();
      }
      t.x = num(action.x, t.x);
      t.y = num(action.y, t.y);
      return {};
    }
    case 'token.toFront': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); const t = findToken(sc, action.id); must(t);
      sc.tokens.splice(sc.tokens.indexOf(t), 1); sc.tokens.push(t);
      return {};
    }
    case 'token.duplicate': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); const t = findToken(sc, action.id); must(t);
      const copy = { ...JSON.parse(JSON.stringify(t)), id: newId('t_'), x: t.x + sc.grid.size, y: t.y };
      sc.tokens.push(copy);
      return { id: copy.id };
    }
    case 'token.delete': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      const ids = new Set(action.ids || [action.id]);
      sc.tokens = sc.tokens.filter((t) => !ids.has(t.id));
      return {};
    }

    // ---------- Mehrfach setzen (Vorschlag 6) ----------
    case 'npc.spawn': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      const base = state.npcs.find((n) => n.id === action.npcId); must(base);
      const labels = (Array.isArray(action.labels) ? action.labels : []).slice(0, 30).map((l) => str(String(l), 6));
      const count = Math.max(1, Math.min(30, labels.length || clampInt(action.count, 1, 30, 1)));
      while (labels.length < count) labels.push(String(labels.length + 1));
      const baseHasToken = state.scenes.some((s) => s.tokens.some((t) => t.refId === base.id));
      const g = sc.grid.size || 70;
      const perRow = Math.ceil(Math.sqrt(count));
      const created = [];
      // Grundname ohne frühere Kennung ("Goblin 1" -> "Goblin"), damit Namen nicht wachsen.
      const baseName = base.baseName || base.name;
      let insertAt = state.npcs.indexOf(base) + 1;
      for (let i = 0; i < count; i++) {
        // Der Original-NPC wird für die erste Figur genutzt, solange er noch keine hat.
        let npc = base;
        if (i > 0 || baseHasToken) {
          npc = JSON.parse(JSON.stringify(base));
          npc.id = newId('n_');
          npc.hp.cur = npc.hp.max; npc.dead = false; npc.conditions = []; npc.deathSaves = { success: 0, fail: 0 };
          state.npcs.splice(insertAt++, 0, npc);
        }
        if (count > 1 || baseHasToken) { npc.baseName = baseName; npc.name = `${baseName} ${labels[i]}`.trim(); }
        const t = {
          id: newId('t_'), kind: 'npc', refId: npc.id, name: npc.name, label: labels[i], assetId: npc.portraitAssetId,
          x: num(action.x) + (i % perRow) * g, y: num(action.y) + Math.floor(i / perRow) * g,
          size: Math.min(10, Math.max(0.25, num(action.size, 1))), ownerSeat: null, hidden: bool(action.hidden),
          visibleTo: null, color: '#8a6d3b', conditions: [],
        };
        sc.tokens.push(t);
        created.push({ npcId: npc.id, tokenId: t.id });
      }
      return { created };
    }

    // ---------- Zeichnungen, Objekte, Schablonen (Vorschlag 10) ----------
    case 'drawing.create': {
      const sc = findScene(action.sceneId); must(sc);
      const d = { id: newId('d_'), type: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0, points: [], stroke: '#2b2118', fill: null,
        strokeWidth: 3, opacity: 1, assetId: null, hidden: false, locked: false, label: '', ownerSeat: null, shape: 'circle', sizeFt: 20,
        ...sanitizeDrawingPatch(action.drawing || {}) };
      if (!isDM) {
        // Spieler dürfen nur Zauberschablonen in ihrer Szene legen.
        if (d.type !== 'template' || sc.id !== sceneIdForSeat(state, who.seat)) deny();
        d.ownerSeat = who.seat; d.hidden = false;
      }
      if (sc.drawings.length >= 1000) throw new ActionError('Zu viele Zeichnungen in dieser Szene');
      sc.drawings.push(d);
      return { id: d.id };
    }
    case 'drawing.update': {
      const sc = findScene(action.sceneId); const d = findDrawing(sc, action.id); must(d);
      if (!isDM && d.ownerSeat !== who.seat) deny();
      const p = sanitizeDrawingPatch(action.patch || {});
      if (!isDM) { delete p.hidden; delete p.type; }
      Object.assign(d, p);
      return {};
    }
    case 'drawing.order': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); const d = findDrawing(sc, action.id); must(d);
      sc.drawings.splice(sc.drawings.indexOf(d), 1);
      if (action.where === 'back') sc.drawings.unshift(d); else sc.drawings.push(d);
      return {};
    }
    case 'drawing.delete': {
      const sc = findScene(action.sceneId); const d = findDrawing(sc, action.id); must(d);
      if (!isDM && d.ownerSeat !== who.seat) deny();
      sc.drawings = sc.drawings.filter((x) => x !== d);
      return {};
    }

    // ---------- Bilder ----------
    case 'asset.rename': {
      if (!isDM) deny();
      const a = state.assets.find((x) => x.id === action.id); must(a);
      a.name = str(action.name, 80) || a.name;
      return {};
    }
    case 'asset.delete': {
      if (!isDM) deny();
      const used = state.scenes.some((sc) => (sc.background && sc.background.assetId === action.id)
        || sc.tokens.some((t) => t.assetId === action.id) || sc.drawings.some((d) => d.assetId === action.id))
        || state.characters.some((c) => c.portraitAssetId === action.id) || state.npcs.some((n) => n.portraitAssetId === action.id);
      if (used) throw new ActionError('Bild wird noch verwendet');
      state.assets = state.assets.filter((a) => a.id !== action.id);
      return { removedAssetId: action.id };
    }

    // ---------- Charaktere ----------
    case 'character.update': {
      const c = state.characters.find((x) => x.id === action.id); must(c);
      const own = who.role === 'player' && who.seat === c.seat;
      if (!isDM && !own) deny();
      applySheetPatch(c, action.patch || {}, { allowPrivateNotes: own, allowInventory: true });
      return {};
    }

    // ---------- Schaden / Heilung für mehrere (Vorschlag 5) ----------
    case 'hp.apply': {
      if (!isDM) deny();
      const mode = ['damage', 'heal', 'temp'].includes(action.mode) ? action.mode : 'damage';
      const downed = [];
      for (const tgt of (action.targets || []).slice(0, 100)) {
        const e = findEntity(tgt.kind, tgt.id);
        if (!e) continue;
        const before = e.hp.cur;
        applyHpChange(e, num(action.amount), mode);
        if (before > 0 && e.hp.cur <= 0) downed.push({ kind: tgt.kind, id: e.id, name: e.name });
      }
      return { downed };
    }

    // ---------- Zustände (Vorschlag 3) ----------
    case 'conditions.set': {
      const tgt = action.target || {};
      if (tgt.kind === 'token') {
        if (!isDM) deny();
        const t = findToken(findScene(tgt.sceneId), tgt.id); must(t);
        t.conditions = sanitizeConditions(action.conditions);
        return {};
      }
      const e = findEntity(tgt.kind, tgt.id); must(e);
      const own = tgt.kind === 'character' && who.role === 'player' && who.seat === e.seat;
      if (!isDM && !own) deny();
      e.conditions = sanitizeConditions(action.conditions);
      return {};
    }

    // ---------- NPCs ----------
    case 'npc.create': {
      if (!isDM) deny();
      const n = newNpc(str(action.name, 80) || 'Neuer NPC');
      state.npcs.push(n);
      return { id: n.id };
    }
    case 'npc.update': {
      if (!isDM) deny();
      const n = state.npcs.find((x) => x.id === action.id); must(n);
      applySheetPatch(n, action.patch || {}, { allowPrivateNotes: false, allowInventory: false, allowNote: true });
      return {};
    }
    case 'npc.duplicate': {
      if (!isDM) deny();
      const n = state.npcs.find((x) => x.id === action.id); must(n);
      const copy = JSON.parse(JSON.stringify(n));
      copy.id = newId('n_');
      copy.name = str(action.name, 80) || `${n.name} (Kopie)`;
      copy.hp.cur = copy.hp.max; copy.dead = false; copy.conditions = [];
      state.npcs.splice(state.npcs.indexOf(n) + 1, 0, copy);
      return { id: copy.id };
    }
    case 'npc.delete': {
      if (!isDM) deny();
      state.npcs = state.npcs.filter((n) => n.id !== action.id);
      state.initiative.entries = state.initiative.entries
        .map((e) => (e.kind === 'group' ? { ...e, refIds: e.refIds.filter((r) => r !== action.id) } : e))
        .filter((e) => e.refId !== action.id && !(e.kind === 'group' && e.refIds.length === 0));
      for (const sc of state.scenes) for (const t of sc.tokens) if (t.refId === action.id) t.refId = null;
      fixCurrent(state);
      return {};
    }

    // ---------- Initiative / Porträtleiste (N7, Vorschlag 1 und 4) ----------
    case 'initiative.add': {
      if (!isDM) deny();
      const kind = action.kind === 'character' ? 'character' : 'npc';
      must(findEntity(kind, action.refId));
      if (!state.initiative.entries.some((e) => e.refId === action.refId)) {
        state.initiative.entries.push({ id: newId('i_'), kind, refId: action.refId, value: action.value === undefined || action.value === null || action.value === '' ? null : num(action.value), visibility: 'auto' });
      }
      fixCurrent(state);
      return {};
    }
    case 'initiative.addGroup': {
      if (!isDM) deny();
      const refIds = [...new Set((action.refIds || []).filter((id) => state.npcs.some((n) => n.id === id)))];
      if (!refIds.length) throw new ActionError('Keine NPCs gewählt');
      // Wer schon einzeln in der Leiste steht, wandert in die Gruppe.
      state.initiative.entries = state.initiative.entries.filter((e) => !(e.kind === 'npc' && refIds.includes(e.refId)));
      const entry = { id: newId('i_'), kind: 'group', name: str(action.name, 60) || 'Gruppe', refIds, value: action.value === undefined || action.value === null || action.value === '' ? null : num(action.value), visibility: 'auto' };
      state.initiative.entries.push(entry);
      fixCurrent(state);
      return { id: entry.id };
    }
    case 'initiative.update': {
      if (!isDM) deny();
      const e = state.initiative.entries.find((x) => x.id === action.id); must(e);
      const p = action.patch || {};
      if ('value' in p) e.value = p.value === null || p.value === '' ? null : num(p.value);
      if ('visibility' in p) e.visibility = ['auto', 'show', 'hide'].includes(p.visibility) ? p.visibility : 'auto';
      if (e.kind === 'group' && 'name' in p) e.name = str(p.name, 60) || e.name;
      return {};
    }
    case 'initiative.sort': {
      if (!isDM) deny();
      const withIdx = state.initiative.entries.map((e, i) => ({ e, i }));
      withIdx.sort((a, b) => {
        const va = a.e.value; const vb = b.e.value;
        if (va === null && vb === null) return a.i - b.i;
        if (va === null) return 1;
        if (vb === null) return -1;
        return vb - va || a.i - b.i;
      });
      state.initiative.entries = withIdx.map((x) => x.e);
      if (action.startTop && state.initiative.entries.length) state.initiative.currentId = state.initiative.entries[0].id;
      return {};
    }
    case 'initiative.remove': {
      if (!isDM) deny();
      const i = state.initiative.entries.findIndex((e) => e.id === action.id);
      if (i >= 0 && state.initiative.currentId === action.id) {
        const next = state.initiative.entries[i + 1] || state.initiative.entries[0];
        state.initiative.currentId = next && next.id !== action.id ? next.id : null;
      }
      state.initiative.entries = state.initiative.entries.filter((e) => e.id !== action.id);
      fixCurrent(state);
      return {};
    }
    case 'initiative.reorder': {
      if (!isDM) deny();
      const ids = Array.isArray(action.ids) ? action.ids : [];
      const byId = new Map(state.initiative.entries.map((e) => [e.id, e]));
      const sorted = ids.map((id) => byId.get(id)).filter(Boolean);
      if (sorted.length !== state.initiative.entries.length) throw new ActionError('Reihenfolge unvollständig');
      state.initiative.entries = sorted;
      return {};
    }
    case 'initiative.setCurrent': {
      if (!isDM) deny();
      must(state.initiative.entries.some((e) => e.id === action.id));
      state.initiative.currentId = action.id;
      return {};
    }
    case 'initiative.next':
    case 'initiative.prev': {
      if (!isDM) deny();
      const list = state.initiative.entries;
      if (list.length) {
        const i = Math.max(0, list.findIndex((e) => e.id === state.initiative.currentId));
        const n = list.length;
        state.initiative.currentId = list[(i + (action.type === 'initiative.next' ? 1 : n - 1)) % n].id;
      }
      return {};
    }
    case 'initiative.clear': {
      if (!isDM) deny();
      state.initiative = { entries: [], currentId: null };
      return {};
    }

    // ---------- Gruppenwerte und gemeinsame Notizen (Vorschlag 11, T4) ----------
    case 'party.update': {
      const p = action.patch || {};
      if ('notes' in p) state.party.notes = str(p.notes, LONG_TEXT);
      if ('gold' in p) state.party.gold = str(p.gold, 60);
      if (isDM) {
        if ('xp' in p) state.party.xp = clampInt(p.xp, 0, 10_000_000);
        if ('date' in p) state.party.date = str(p.date, 80);
      } else if ('xp' in p || 'date' in p) deny('XP und Spieldatum ändert der DM');
      return {};
    }

    // ---------- Würfel (Vorschlag 12) ----------
    case 'dice.roll': {
      const secret = isDM && bool(action.secret);
      let r;
      try { r = rollDice(str(action.expr, 60)); } catch (e) { throw new ActionError(e.message); }
      const seat = isDM ? null : who.seat;
      const ch = seat ? state.characters.find((c) => c.seat === seat) : null;
      const entry = {
        id: newId('w_'), ts: Date.now(), seat, by: isDM ? 'DM' : (ch ? ch.name : `Platz ${seat}`),
        expr: r.expr, detail: r.detail, total: r.total, secret, label: str(action.label, 40),
      };
      state.diceLog.push(entry);
      if (state.diceLog.length > DICE_LOG) state.diceLog.splice(0, state.diceLog.length - DICE_LOG);
      return { roll: entry };
    }

    // ---------- Notizen, Plätze, Einstellungen ----------
    case 'dm.notes': {
      if (!isDM) deny();
      state.dmNotes = str(action.text, LONG_TEXT);
      return {};
    }
    case 'seat.rename': {
      const seat = state.seats.find((s) => s.seat === action.seat); must(seat);
      if (!isDM && who.seat !== seat.seat) deny();
      seat.playerName = str(action.playerName, 40);
      return {};
    }
    case 'seat.release': {
      if (!isDM) deny();
      const seat = state.seats.find((s) => s.seat === action.seat); must(seat);
      seat.claimToken = null;
      return { releasedSeat: seat.seat };
    }
    case 'settings.update': {
      if (!isDM) deny();
      const p = action.patch || {};
      if ('pin' in p) state.settings.pin = str(p.pin, 20).trim();
      if ('seatCount' in p) return { seatCount: changeSeatCount(state, p.seatCount) };
      return {};
    }
    default:
      throw new ActionError(`Unbekannte Aktion: ${action.type}`);
  }
}

function fixCurrent(state) {
  const ini = state.initiative;
  if (!ini.entries.some((e) => e.id === ini.currentId)) ini.currentId = ini.entries.length ? ini.entries[0].id : null;
}

// ---------- Rollenabhängige Sichten ----------

/** Sicht des DM: alles außer privaten Spielernotizen und Platz-Schlüsseln. */
function viewForDM(state) {
  const s = JSON.parse(JSON.stringify(state));
  s.characters.forEach((c) => { delete c.privateNotes; });
  s.seats.forEach((seat) => { seat.taken = !!seat.claimToken; delete seat.claimToken; seat.sceneId = sceneIdForSeat(state, seat.seat); });
  delete s.settings.pin; // wird separat über "info" übertragen
  s.settings.pinSet = !!state.settings.pin;
  s.npcs.forEach((n) => { n.condition = roughCondition(n.hp, n.dead); });
  // Für welche Plätze ist ein Leisteneintrag gerade sichtbar? (DM sieht das in der Leiste)
  s.initiative.entries.forEach((e) => {
    e.visibleSeats = state.seats.map((x) => x.seat).filter((seat) => entryVisibleToSeat(state, e, seat));
  });
  s.seatCount = SEAT_COUNT;
  return s;
}

/** Sicht eines Spielers: nur seine Szene, nichts Verstecktes, keine NPC-Werte. */
function viewForPlayer(state, seatNo) {
  const scene = state.scenes.find((s) => s.id === sceneIdForSeat(state, seatNo));
  const npcById = new Map(state.npcs.map((n) => [n.id, n]));
  const charById = new Map(state.characters.map((c) => [c.id, c]));
  const usedAssets = new Set();

  const tokens = scene.tokens.filter((t) => tokenVisibleToSeat(scene, t, seatNo)).map((t) => {
    if (t.assetId) usedAssets.add(t.assetId);
    const out = { ...t };
    delete out.visibleTo;
    if (t.kind === 'npc' && t.refId && npcById.has(t.refId)) {
      const n = npcById.get(t.refId);
      out.condition = roughCondition(n.hp, n.dead);
      out.conditions = n.conditions;
    }
    if (t.kind === 'player' && t.refId && charById.has(t.refId)) {
      const c = charById.get(t.refId);
      out.hpRatio = c.hp.max ? c.hp.cur / c.hp.max : null;
      out.conditions = c.conditions;
      out.down = c.hp.cur <= 0;
    }
    return out;
  });
  const drawings = scene.drawings.filter((d) => drawingVisibleToSeat(scene, d, seatNo));
  for (const d of drawings) if (d.assetId) usedAssets.add(d.assetId);
  if (scene.background) usedAssets.add(scene.background.assetId);

  const entries = state.initiative.entries.filter((e) => entryVisibleToSeat(state, e, seatNo)).map((e) => {
    if (e.kind === 'group') {
      const members = e.refIds.map((id) => npcById.get(id)).filter(Boolean);
      const portrait = members.find((m) => m.portraitAssetId)?.portraitAssetId || null;
      if (portrait) usedAssets.add(portrait);
      return { id: e.id, kind: 'group', name: e.name, portraitAssetId: portrait, value: e.value, count: members.length };
    }
    const src = e.kind === 'character' ? charById.get(e.refId) : npcById.get(e.refId);
    if (src && src.portraitAssetId) usedAssets.add(src.portraitAssetId);
    return {
      id: e.id, kind: e.kind, refId: e.refId, value: e.value,
      name: src ? src.name : '?',
      portraitAssetId: src ? src.portraitAssetId : null,
      condition: e.kind === 'npc' && src ? roughCondition(src.hp, src.dead) : undefined,
      conditions: src ? src.conditions : [],
    };
  });
  const currentVisible = entries.some((e) => e.id === state.initiative.currentId);

  const characters = state.characters.map((c) => {
    if (c.portraitAssetId) usedAssets.add(c.portraitAssetId);
    if (c.seat === seatNo) return JSON.parse(JSON.stringify(c));
    return { id: c.id, seat: c.seat, name: c.name, portraitAssetId: c.portraitAssetId, conditions: c.conditions };
  });

  return {
    version: state.version,
    activeSceneId: scene.id,
    scenes: [{
      id: scene.id, name: scene.name, background: scene.background, mapScale: scene.mapScale,
      grid: scene.grid, night: scene.night, tokens, drawings,
      fog: scene.fog.enabled ? { enabled: true, shapes: scene.fog.shapes } : { enabled: false, shapes: [] },
    }],
    assets: state.assets.filter((a) => usedAssets.has(a.id)),
    seats: state.seats.map((s) => ({ seat: s.seat, playerName: s.playerName, taken: !!s.claimToken })),
    characters,
    initiative: { entries, currentId: currentVisible ? state.initiative.currentId : null },
    party: state.party,
    diceLog: state.diceLog.filter((d) => !d.secret),
    me: { seat: seatNo },
    seatCount: SEAT_COUNT,
  };
}

/** Kopie für den Export: ohne Platz-Schlüssel (die gehören zu dieser Sitzung). */
function exportableState(state) {
  const s = JSON.parse(JSON.stringify(state));
  s.seats.forEach((seat) => { seat.claimToken = null; });
  return s;
}

module.exports = {
  MAX_SEATS, configureSeats, seatCount, createInitialState, normalizeState, applyAction, ActionError,
  viewForDM, viewForPlayer, exportableState, roughCondition, newId,
  sceneIdForSeat, tokenVisibleToSeat, pointRevealed,
};
