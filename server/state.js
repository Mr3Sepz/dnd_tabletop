'use strict';
/**
 * Datenmodell, Aktionen (mit Rechteprüfung) und rollenabhängige Sichten.
 *
 * Der Server hält den einzigen gültigen Spielstand. Clients schicken nur
 * Aktionen ("Token 3 nach x/y"); der Server prüft, ob die Rolle das darf,
 * ändert den Zustand und verteilt danach eine passend gefilterte Kopie.
 */
const crypto = require('crypto');

const SEAT_COUNT = 5;
const SLOT_LEVELS = 9;
const STATE_VERSION = 1;

const newId = (prefix = '') => prefix + crypto.randomBytes(5).toString('hex');

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
const optSeat = (v) => (v === null || v === undefined || v === '' ? null : clampInt(v, 1, SEAT_COUNT, null));
const LONG_TEXT = 100_000;

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
    grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, color: '#000000', opacity: 0.35 },
    night: false,
    notes: '',
    tokens: [],
  };
}

function createInitialState() {
  const first = newScene('Erste Szene');
  return {
    version: STATE_VERSION,
    activeSceneId: first.id,
    settings: { pin: '' },
    scenes: [first],
    assets: [],
    seats: Array.from({ length: SEAT_COUNT }, (_, i) => ({ seat: i + 1, playerName: '', claimToken: null })),
    characters: Array.from({ length: SEAT_COUNT }, (_, i) => newCharacter(i + 1)),
    npcs: [],
    initiative: { entries: [], current: 0 },
    dmNotes: '',
  };
}

/** Bringt einen geladenen (evtl. älteren/unvollständigen) Zustand in Form. */
function normalizeState(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.scenes = Array.isArray(raw.scenes) && raw.scenes.length ? raw.scenes : base.scenes;
  s.scenes = s.scenes.map((sc) => ({ ...newScene(), ...sc, grid: { ...newScene().grid, ...(sc.grid || {}) }, tokens: Array.isArray(sc.tokens) ? sc.tokens : [] }));
  if (!s.scenes.some((sc) => sc.id === s.activeSceneId)) s.activeSceneId = s.scenes[0].id;
  s.assets = Array.isArray(raw.assets) ? raw.assets : [];
  s.seats = base.seats.map((b) => ({ ...b, ...((raw.seats || []).find((x) => x.seat === b.seat) || {}) }));
  s.characters = base.characters.map((b) => {
    const c = (raw.characters || []).find((x) => x.seat === b.seat);
    return c ? { ...b, ...c, slots: normalizeSlots(c.slots) } : b;
  });
  s.npcs = (Array.isArray(raw.npcs) ? raw.npcs : []).map((n) => ({ ...newNpc(), ...n, slots: normalizeSlots(n.slots) }));
  s.initiative = { entries: [], current: 0, ...(raw.initiative || {}) };
  s.version = STATE_VERSION;
  return s;
}

function normalizeSlots(slots) {
  const out = emptySlots();
  if (Array.isArray(slots)) for (const sl of slots) {
    const t = out.find((o) => o.level === sl.level);
    if (t) { t.max = clampInt(sl.max, 0, 99); t.used = clampInt(sl.used, 0, t.max); }
  }
  return out;
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
    target.hp = hp;
  }
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

// ---------- Token-Felder ----------

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
  if ('kind' in patch) out.kind = ['player', 'npc', 'marker'].includes(patch.kind) ? patch.kind : 'marker';
  if ('refId' in patch) out.refId = patch.refId ? str(patch.refId, 60) : null;
  if ('color' in patch) out.color = /^#[0-9a-fA-F]{6}$/.test(patch.color) ? patch.color : '#8a6d3b';
  return out;
}

/** Grober Gesundheitszustand, den Spieler statt genauer HP sehen (N8). */
function roughCondition(hp) {
  if (!hp || hp.max <= 0) return 'unbekannt';
  if (hp.cur <= 0) return 'besiegt';
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
 * Gibt optional ein Ergebnisobjekt zurück. Wirft ActionError bei Fehlern.
 */
function applyAction(state, who, action) {
  if (!action || typeof action.type !== 'string') throw new ActionError('Ungültige Aktion');
  const isDM = who.role === 'dm';
  const findScene = (id) => state.scenes.find((s) => s.id === id);
  const findToken = (scene, id) => scene && scene.tokens.find((t) => t.id === id);

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
        if ('size' in p.grid) g.size = Math.min(500, Math.max(10, num(p.grid.size, 70)));
        if ('offsetX' in p.grid) g.offsetX = num(p.grid.offsetX);
        if ('offsetY' in p.grid) g.offsetY = num(p.grid.offsetY);
        if ('opacity' in p.grid) g.opacity = Math.min(1, Math.max(0, num(p.grid.opacity, 0.35)));
        if ('color' in p.grid && /^#[0-9a-fA-F]{6}$/.test(p.grid.color)) g.color = p.grid.color;
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
      state.scenes.splice(state.scenes.indexOf(sc) + 1, 0, copy);
      return { id: copy.id };
    }
    case 'scene.delete': {
      if (!isDM) deny();
      if (state.scenes.length <= 1) throw new ActionError('Die letzte Szene kann nicht gelöscht werden');
      const i = state.scenes.findIndex((s) => s.id === action.id); must(i >= 0);
      state.scenes.splice(i, 1);
      if (state.activeSceneId === action.id) state.activeSceneId = state.scenes[0].id;
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
      if (!isDM) deny();
      must(findScene(action.id));
      state.activeSceneId = action.id;
      return {};
    }

    // ---------- Figuren ----------
    case 'token.create': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      const t = {
        id: newId('t_'), x: 0, y: 0, size: 1, label: '', name: '', assetId: null,
        ownerSeat: null, hidden: false, kind: 'marker', refId: null, color: '#8a6d3b',
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
    case 'token.move': {
      const sc = findScene(action.sceneId); const t = findToken(sc, action.id); must(t);
      if (!isDM) {
        // Spieler: nur eigene, sichtbare Figuren in der aktiven Szene.
        if (sc.id !== state.activeSceneId || t.ownerSeat !== who.seat || t.hidden) deny();
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
      const copy = { ...t, id: newId('t_'), x: t.x + 30, y: t.y + 30 };
      sc.tokens.push(copy);
      return { id: copy.id };
    }
    case 'token.delete': {
      if (!isDM) deny();
      const sc = findScene(action.sceneId); must(sc);
      sc.tokens = sc.tokens.filter((t) => t.id !== action.id);
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
      const used = state.scenes.some((sc) => (sc.background && sc.background.assetId === action.id) || sc.tokens.some((t) => t.assetId === action.id))
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
      copy.hp.cur = copy.hp.max;
      state.npcs.splice(state.npcs.indexOf(n) + 1, 0, copy);
      return { id: copy.id };
    }
    case 'npc.delete': {
      if (!isDM) deny();
      state.npcs = state.npcs.filter((n) => n.id !== action.id);
      state.initiative.entries = state.initiative.entries.filter((e) => e.refId !== action.id);
      for (const sc of state.scenes) for (const t of sc.tokens) if (t.refId === action.id) t.refId = null;
      clampInitiative(state);
      return {};
    }

    // ---------- Initiative / Porträtleiste (N7) ----------
    case 'initiative.add': {
      if (!isDM) deny();
      const kind = action.kind === 'character' ? 'character' : 'npc';
      const exists = kind === 'character' ? state.characters.some((c) => c.id === action.refId) : state.npcs.some((n) => n.id === action.refId);
      must(exists);
      if (!state.initiative.entries.some((e) => e.refId === action.refId)) {
        state.initiative.entries.push({ id: newId('i_'), kind, refId: action.refId });
      }
      return {};
    }
    case 'initiative.remove': {
      if (!isDM) deny();
      state.initiative.entries = state.initiative.entries.filter((e) => e.id !== action.id);
      clampInitiative(state);
      return {};
    }
    case 'initiative.reorder': {
      if (!isDM) deny();
      const ids = Array.isArray(action.ids) ? action.ids : [];
      const byId = new Map(state.initiative.entries.map((e) => [e.id, e]));
      const sorted = ids.map((id) => byId.get(id)).filter(Boolean);
      if (sorted.length !== state.initiative.entries.length) throw new ActionError('Reihenfolge unvollständig');
      const currentId = state.initiative.entries[state.initiative.current]?.id;
      state.initiative.entries = sorted;
      const ni = sorted.findIndex((e) => e.id === currentId);
      state.initiative.current = ni >= 0 ? ni : 0;
      return {};
    }
    case 'initiative.setCurrent': {
      if (!isDM) deny();
      const i = state.initiative.entries.findIndex((e) => e.id === action.id); must(i >= 0);
      state.initiative.current = i;
      return {};
    }
    case 'initiative.next':
    case 'initiative.prev': {
      if (!isDM) deny();
      const n = state.initiative.entries.length;
      if (n) state.initiative.current = (state.initiative.current + (action.type === 'initiative.next' ? 1 : n - 1)) % n;
      return {};
    }
    case 'initiative.clear': {
      if (!isDM) deny();
      state.initiative = { entries: [], current: 0 };
      return {};
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
      return {};
    }
    default:
      throw new ActionError(`Unbekannte Aktion: ${action.type}`);
  }
}

function clampInitiative(state) {
  const n = state.initiative.entries.length;
  if (state.initiative.current >= n) state.initiative.current = n ? n - 1 : 0;
}

// ---------- Rollenabhängige Sichten ----------

/** Sicht des DM: alles außer privaten Spielernotizen und Platz-Schlüsseln. */
function viewForDM(state) {
  const s = JSON.parse(JSON.stringify(state));
  s.characters.forEach((c) => { delete c.privateNotes; });
  s.seats.forEach((seat) => { seat.taken = !!seat.claimToken; delete seat.claimToken; });
  delete s.settings.pin; // wird separat über "info" übertragen
  s.settings.pinSet = !!state.settings.pin;
  s.npcs.forEach((n) => { n.condition = roughCondition(n.hp); });
  return s;
}

/** Sicht eines Spielers: nur aktive Szene, nichts Verstecktes, keine NPC-Werte. */
function viewForPlayer(state, seatNo) {
  const scene = state.scenes.find((s) => s.id === state.activeSceneId);
  const npcById = new Map(state.npcs.map((n) => [n.id, n]));
  const charById = new Map(state.characters.map((c) => [c.id, c]));
  const usedAssets = new Set();

  const tokens = scene.tokens.filter((t) => !t.hidden).map((t) => {
    if (t.assetId) usedAssets.add(t.assetId);
    const out = { ...t };
    if (t.kind === 'npc' && t.refId && npcById.has(t.refId)) out.condition = roughCondition(npcById.get(t.refId).hp);
    if (t.kind === 'player' && t.refId && charById.has(t.refId)) {
      const c = charById.get(t.refId); out.hpRatio = c.hp.max ? c.hp.cur / c.hp.max : null;
    }
    return out;
  });
  if (scene.background) usedAssets.add(scene.background.assetId);

  const initiative = {
    current: state.initiative.current,
    entries: state.initiative.entries.map((e) => {
      const src = e.kind === 'character' ? charById.get(e.refId) : npcById.get(e.refId);
      if (src && src.portraitAssetId) usedAssets.add(src.portraitAssetId);
      return {
        id: e.id, kind: e.kind, refId: e.refId,
        name: src ? src.name : '?',
        portraitAssetId: src ? src.portraitAssetId : null,
        condition: e.kind === 'npc' && src ? roughCondition(src.hp) : undefined,
      };
    }),
  };

  const characters = state.characters.map((c) => {
    if (c.portraitAssetId) usedAssets.add(c.portraitAssetId);
    if (c.seat === seatNo) return JSON.parse(JSON.stringify(c));
    return { id: c.id, seat: c.seat, name: c.name, portraitAssetId: c.portraitAssetId };
  });

  return {
    version: state.version,
    activeSceneId: scene.id,
    scenes: [{
      id: scene.id, name: scene.name, background: scene.background, mapScale: scene.mapScale,
      grid: scene.grid, night: scene.night, tokens,
    }],
    assets: state.assets.filter((a) => usedAssets.has(a.id)),
    seats: state.seats.map((s) => ({ seat: s.seat, playerName: s.playerName, taken: !!s.claimToken })),
    characters,
    initiative,
    me: { seat: seatNo },
  };
}

/** Kopie für den Export: ohne Platz-Schlüssel (die gehören zu dieser Sitzung). */
function exportableState(state) {
  const s = JSON.parse(JSON.stringify(state));
  s.seats.forEach((seat) => { seat.claimToken = null; });
  return s;
}

module.exports = {
  SEAT_COUNT, createInitialState, normalizeState, applyAction, ActionError,
  viewForDM, viewForPlayer, exportableState, roughCondition, newId,
};
