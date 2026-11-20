// DM-Ansicht (A1): Karte mit Werkzeugleiste in der Mitte, alle Verwaltung in der Seitenleiste.

import { $, $$, h, toast, dialog, debounce, assetUrl, initials, pickAndUploadImages, uploadImage, HEALTH_COLORS } from './util.js';
import { connect } from './net.js';
import { Board, TOOLS } from './board.js';
import { Sheet } from './sheet.js';
import { renderInitiative } from './initiative.js';
import { editConditions } from './conditions.js';
import { DicePanel } from './dice.js';

let conn;
let state = null;        // DM-Sicht vom Server
let info = null;         // Adressen, QR-Codes, PIN, Pfade
let editSceneId = null;  // welche Szene der DM gerade bearbeitet (S4)
let previewSeat = 0;     // "Als Spieler ansehen" (A4)
let previewView = null;  // echte Spielersicht vom Server
let tab = 'scenes';
let placing = null;      // nächste Figur (F1: von Hand setzen)
let selected = { players: null, npcs: null }; // geöffneter Bogen
let selection = [];      // markierte Figuren (Mehrfachauswahl)
const sheets = new Map();
let panelDirty = false;
let prevNpcHp = new Map(); // für die Frage "tot oder am Boden?"
const downQueue = [];
let downDialogOpen = false;

// ================================================================ Start

async function start() {
  const pub = await fetch('/api/public-info').then((r) => r.json()).catch(() => ({}));
  let hasSession = false;
  try { hasSession = !!localStorage.getItem('dnd.dmSession'); } catch { /* egal */ }
  if (pub.dmPasswordRequired && !hasSession) return showLogin('');
  open({ mode: 'dm' });
}

function showLogin(msg) {
  $('#login').classList.remove('hidden');
  $('#loginMsg').textContent = msg;
  $('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    const password = e.target.elements.password.value;
    if (conn) conn.socket.close();
    open({ mode: 'dm', password });
  };
}

function open(payload) {
  conn = connect(payload, {
    onJoined: () => { $('#login').classList.add('hidden'); },
    onJoinError: (err) => {
      conn.socket.close();
      if (/Passwort/.test(err) && !/Ohne DM-Passwort/.test(err)) showLogin(err);
      else { $('#login').classList.remove('hidden'); $('#loginForm').replaceChildren(h('h1', {}, 'Kein Zugriff'), h('p', {}, err)); }
    },
    onConnection: (ok) => { $('#conn').classList.toggle('on', ok); },
    onState: (s) => { detectDowned(s); state = s; dice.setLog(s.diceLog || []); render(); },
    onInfo: (i) => { info = i; if (tab === 'game') renderPanel(true); },
    onSaved: (i) => { if (info) info.lastSaved = i.lastSaved; if (tab === 'game') renderPanel(); },
    onDice: (r) => dice.announce(r),
    onStopping: () => {
      $('#login').classList.remove('hidden');
      $('#loginForm').replaceChildren(h('h1', {}, 'Server beendet'), h('p', {}, 'Der Spielstand wurde gespeichert. Du kannst dieses Fenster schließen.'));
    },
    onTokenMoved: (m) => {
      const sc = state && state.scenes.find((s) => s.id === m.sceneId);
      const t = sc && sc.tokens.find((x) => x.id === m.id);
      if (t) { t.x = m.x; t.y = m.y; }
      if (!previewSeat && boardSceneId() === m.sceneId) board.moveToken(m.id, m.x, m.y);
    },
  });
}

const dice = new DicePanel({ isDM: true, act: (a) => conn.act(a) });

// ================================================================ Hilfen

const scene = (id) => state.scenes.find((s) => s.id === id);
const editScene = () => scene(editSceneId) || scene(state.activeSceneId);
const boardSceneId = () => (previewSeat && previewView ? previewView.activeSceneId : editScene()?.id);
const npc = (id) => state.npcs.find((n) => n.id === id);
const character = (id) => state.characters.find((c) => c.id === id);
const act = (a) => conn.act(a);
const seatLabel = (s) => `Platz ${s.seat}${s.playerName ? ` – ${s.playerName}` : ''}`;

function tokenSource(t) {
  if (t.kind === 'npc' && t.refId) return npc(t.refId);
  if (t.kind === 'player' && t.refId) return character(t.refId);
  return null;
}
const hpRatio = (src) => (src && src.hp && src.hp.max > 0 ? src.hp.cur / src.hp.max : null);
const targetOf = (t) => {
  const src = tokenSource(t);
  return src ? { kind: t.kind === 'npc' ? 'npc' : 'character', id: src.id } : null;
};

// ================================================================ Karte

const board = new Board($('#board'), {
  isDM: true,
  showHpBars: true,
  canDrag: () => !previewSeat,
  onMove: (t, x, y, final) => act({ type: 'token.move', sceneId: boardSceneId(), id: t.id, x, y, final }),
  onTokenClick: (t) => {
    if (previewSeat) return;
    if (t.kind === 'npc' && t.refId && npc(t.refId)) openSheet('npcs', t.refId);
    else if (t.kind === 'player' && t.refId && character(t.refId)) openSheet('players', t.refId);
  },
  onTokenContext: (t, x, y) => {
    if (previewSeat) return;
    if (selection.length > 1 && selection.includes(t.id)) selectionMenu(x, y); else tokenMenu(t, x, y);
  },
  onBackgroundClick: (pos) => { hideMenu(); if (placing) placeAt(pos); },
  tokenInfo: (t) => {
    if (previewSeat) {
      return { health: t.condition, conditions: t.conditions || [], down: t.condition === 'am Boden' || t.down, dead: t.condition === 'tot' };
    }
    const src = tokenSource(t);
    return {
      hpRatio: hpRatio(src),
      conditions: src ? src.conditions : t.conditions,
      down: !!src && src.hp.cur <= 0 && !src.dead,
      dead: !!src && t.kind === 'npc' && src.dead,
    };
  },
  canEditDrawing: () => !previewSeat,
  onDrawingChange: (d, patch) => act({ type: 'drawing.update', sceneId: boardSceneId(), id: d.id, patch }),
  onDrawingContext: (d, x, y) => { if (!previewSeat) drawingMenu(d, x, y); },
  onCreateDrawing: (d) => act({ type: 'drawing.create', sceneId: editScene().id, drawing: d }),
  onFogShape: (shape) => act({ type: 'fog.add', sceneId: editScene().id, shape }),
  onToolDone: () => renderToolbar(),
  onSelectionChange: (ids) => { selection = ids; renderSelbar(); if (tab === 'tokens') renderPanel(); },
});

// Bilder aus der Sammlung auf die Karte ziehen (F1, F11)
$('#board').addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/asset')) e.preventDefault(); });
$('#board').addEventListener('drop', (e) => {
  const assetId = e.dataTransfer.getData('text/asset');
  if (!assetId) return;
  e.preventDefault();
  const a = state.assets.find((x) => x.id === assetId);
  placing = { kind: 'token', token: { assetId, name: a ? a.name : '', kind: 'marker' } };
  placeAt(board.worldFromClient(e.clientX, e.clientY));
});

async function placeAt(pos) {
  const sc = editScene();
  const p = placing;
  placing = null;
  updateBanner();
  if (p.kind === 'spawn') {
    await act({ type: 'npc.spawn', sceneId: sc.id, npcId: p.npcId, labels: p.labels, hidden: p.hidden, size: p.size, ...board.snap(pos, p.size || 1) });
  } else {
    const q = board.snap(pos, p.token.size || 1);
    await act({ type: 'token.create', sceneId: sc.id, token: { ...p.token, x: q.x, y: q.y } });
  }
}

function startPlacing(p, what) {
  placing = p;
  board.setTool('select');
  renderToolbar();
  if (window.matchMedia('(max-width: 900px)').matches) document.body.classList.remove('panel-open');
  updateBanner(`Tippe auf die Karte, um ${what} zu setzen.`);
}

function updateBanner(msg) {
  const b = $('#banner');
  const parts = [];
  if (previewSeat) parts.push(h('span', {}, `Vorschau: So sieht Platz ${previewSeat} das Spiel, mit Nebel und allem, was verborgen ist. Bearbeiten ist aus.`));
  else if (state && editScene()) {
    const viewers = state.seats.filter((s) => s.sceneId === editScene().id).map((s) => s.seat);
    if (editScene().id !== state.activeSceneId && !viewers.length) {
      parts.push(h('span', {}, `Du bearbeitest „${editScene().name}“. Kein Spieler sieht diese Szene gerade.`));
    } else if (editScene().id !== state.activeSceneId) {
      parts.push(h('span', {}, `Du bearbeitest „${editScene().name}“. Hier sind gerade: Platz ${viewers.join(', ')}.`));
    }
  }
  if (msg || placing) parts.push(h('span', {}, msg || 'Auf die Karte tippen zum Setzen.'), h('button.small', { onclick: () => { placing = null; updateBanner(); } }, 'Abbrechen'));
  b.replaceChildren(...parts);
  b.classList.toggle('hidden', parts.length === 0);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { placing = null; hideMenu(); updateBanner(); board.setTool('select'); renderToolbar(); }
});

// ================================================================ Werkzeugleiste

const TOOL_ICONS = {
  select: '🖐', measure: '📏', rect: '▭', ellipse: '◯', line: '✎',
  'fog-rect-reveal': '☀▭', 'fog-rect-hide': '☁▭', 'fog-brush-reveal': '☀✎', 'fog-brush-hide': '☁✎',
};

function renderToolbar() {
  const tb = $('#toolbar');
  const tool = board.tool;
  const btn = (key) => h(`button.tool${tool === key ? '.active' : ''}`, { title: TOOLS[key], onclick: () => { board.setTool(key); renderToolbar(); } }, TOOL_ICONS[key]);
  const style = board.drawStyle;
  tb.replaceChildren(...[
    btn('select'), btn('measure'),
    h('span.tb-sep'),
    btn('rect'), btn('ellipse'), btn('line'),
    h('button.tool', { title: 'Objekt aus der Bildersammlung setzen (z. B. Wagen, Tür)', onclick: placeObject }, '🧱'),
    h('button.tool', { title: 'Zauberschablone setzen (Kreis, Kegel, Linie, Würfel)', onclick: () => placeTemplate() }, '🔥'),
    h('span.tb-sep'),
    btn('fog-rect-reveal'), btn('fog-rect-hide'), btn('fog-brush-reveal'), btn('fog-brush-hide'),
    ['rect', 'ellipse', 'line'].includes(tool) ? h('div.tb-style', {},
      h('label', { title: 'Linienfarbe' }, h('input', { type: 'color', value: style.stroke, onchange: (e) => { style.stroke = e.target.value; } })),
      h('label', { title: 'Füllung' }, h('input', { type: 'checkbox', checked: !!style.fill, onchange: (e) => { style.fill = e.target.checked ? (style.lastFill || '#8a6d3b') : null; renderToolbar(); } }),
        style.fill ? h('input', { type: 'color', value: style.fill, onchange: (e) => { style.fill = e.target.value; style.lastFill = e.target.value; } }) : 'füllen'),
      h('label', { title: 'Strichstärke' }, h('input', { type: 'range', min: 1, max: 30, value: style.strokeWidth, onchange: (e) => { style.strokeWidth = Number(e.target.value); } }))) : null,
    tool.startsWith('fog-brush') ? h('div.tb-style', {}, h('label', { title: 'Pinselgröße' }, 'Pinsel',
      h('input', { type: 'range', min: 15, max: 300, value: board.brushRadius, onchange: (e) => { board.brushRadius = Number(e.target.value); } }))) : null,
  ].filter(Boolean));
}

async function placeObject() {
  if (!state.assets.length) return toast('Erst Bilder in die Sammlung laden (Reiter Figuren).', 'error');
  const r = await dialog({ title: 'Objekt setzen', body: 'Ein Bild als eckiges, drehbares Objekt auf die Karte legen, z. B. Wagen, Tür, Tisch.',
    fields: [{ name: 'asset', label: 'Bild', type: 'select', value: state.assets[0].id, options: state.assets.map((a) => ({ value: a.id, label: a.name })) },
      { name: 'cells', label: 'Breite in Feldern', type: 'number', value: 2, step: 0.5, min: 0.5 }], okText: 'Auf die Karte tippen …' });
  if (!r) return;
  const a = state.assets.find((x) => x.id === r.asset);
  const g = editScene().grid.size;
  const w = Math.max(10, r.cells * g);
  board.setTool('place-image', { drawing: { type: 'image', assetId: a.id, w, h: w * (a.height / a.width), label: '' } });
  renderToolbar();
  updateBanner('Auf die Karte tippen, um das Objekt zu setzen. Danach kannst du es drehen und skalieren.');
}

async function placeTemplate(forPlayer = false) {
  const r = await dialog({ title: 'Zauberschablone', fields: [
    { name: 'shape', label: 'Form', type: 'select', value: 'circle', options: [
      { value: 'circle', label: 'Kreis/Kugel (Radius)' }, { value: 'cone', label: 'Kegel (Länge)' },
      { value: 'line', label: 'Linie (Länge, 5 ft breit)' }, { value: 'square', label: 'Würfel (Kantenlänge)' }] },
    { name: 'sizeFt', label: 'Größe in Fuß', type: 'number', value: 20, step: 5, min: 5 },
    { name: 'fill', label: 'Farbe', type: 'color', value: '#f26b1d' },
  ], okText: 'Auf die Karte tippen …' });
  if (!r) return;
  board.setTool('place-template', { drawing: { type: 'template', shape: r.shape, sizeFt: r.sizeFt, fill: r.fill, stroke: '#b2410e' } });
  renderToolbar();
  updateBanner('Auf die Karte tippen: Dort ist der Ursprung. Danach mit dem Drehgriff ausrichten.');
  return forPlayer;
}

// ================================================================ Menüs

function hideMenu() { $('#ctxMenu').classList.add('hidden'); }

function showMenu(title, items, x, y) {
  const menu = $('#ctxMenu');
  menu.replaceChildren(h('div.ctx-title', {}, title),
    ...items.filter(Boolean).map(([label, fn, cls]) => h(`button${cls ? '.' + cls : ''}`, { onclick: () => { hideMenu(); fn(); } }, label)));
  menu.classList.remove('hidden');
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 8))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 8))}px`;
}
document.addEventListener('pointerdown', (e) => { if (!$('#ctxMenu').contains(e.target)) hideMenu(); });

function tokenMenu(t, x, y) {
  const sc = editScene();
  const src = tokenSource(t);
  const tgt = targetOf(t);
  showMenu(t.name || t.label || 'Figur', [
    tgt ? ['Schaden / Heilung …', () => hpDialog([tgt], t.name)] : null,
    ['Zustände …', async () => {
      const list = await editConditions(src ? src.conditions : t.conditions, `Zustände: ${t.name || 'Figur'}`);
      if (list) act({ type: 'conditions.set', target: tgt || { kind: 'token', sceneId: sc.id, id: t.id }, conditions: list });
    }],
    src && t.kind === 'npc' && src.hp.cur <= 0 ? [src.dead ? 'Doch nur am Boden' : 'Als tot markieren', () => act({ type: 'npc.update', id: src.id, patch: { dead: !src.dead } })] : null,
    [t.hidden ? 'Aufdecken (für Spieler sichtbar)' : 'Verstecken (nur du siehst sie)', () => act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: { hidden: !t.hidden } })],
    ['Sichtbar für …', () => visibilityDialog([t])],
    ['Bearbeiten …', () => editToken(t)],
    src ? ['Werte öffnen', () => openSheet(t.kind === 'npc' ? 'npcs' : 'players', src.id)] : null,
    src && !state.initiative.entries.some((e) => e.refId === src.id || (e.refIds || []).includes(src.id)) ? ['In Porträtleiste', () => act({ type: 'initiative.add', kind: t.kind === 'npc' ? 'npc' : 'character', refId: src.id })] : null,
    ['Größer', () => act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: { size: (t.size || 1) + 0.5 } })],
    ['Kleiner', () => act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: { size: Math.max(0.5, (t.size || 1) - 0.5) } })],
    ['Kopieren', () => act({ type: 'token.duplicate', sceneId: sc.id, id: t.id })],
    ['Nach vorne', () => act({ type: 'token.toFront', sceneId: sc.id, id: t.id })],
    ['Löschen', async () => {
      if (await dialog({ title: 'Figur löschen?', body: t.name || t.label || 'Diese Figur', okText: 'Löschen', danger: true })) act({ type: 'token.delete', sceneId: sc.id, id: t.id });
    }, 'danger'],
  ], x, y);
}

function selectedTokens() {
  const sc = editScene();
  return selection.map((id) => sc.tokens.find((t) => t.id === id)).filter(Boolean);
}

function selectionMenu(x, y) {
  const toks = selectedTokens();
  const sc = editScene();
  const targets = toks.map(targetOf).filter(Boolean);
  const npcIds = toks.filter((t) => t.kind === 'npc' && t.refId && npc(t.refId)).map((t) => t.refId);
  showMenu(`${toks.length} Figuren`, [
    targets.length ? ['Schaden / Heilung für alle …', () => hpDialog(targets, `${targets.length} Figuren`)] : null,
    ['Zustand für alle …', async () => {
      const list = await editConditions([], `Zustände für ${toks.length} Figuren (werden ergänzt)`);
      if (!list) return;
      for (const t of toks) {
        const src = tokenSource(t);
        const cur = src ? src.conditions : t.conditions || [];
        const merged = [...cur, ...list.filter((n) => !cur.some((c) => c.key === n.key && (n.key !== 'custom' || c.label === n.label)))];
        await act({ type: 'conditions.set', target: targetOf(t) || { kind: 'token', sceneId: sc.id, id: t.id }, conditions: merged });
      }
    }],
    ['Alle aufdecken', () => act({ type: 'token.updateMany', sceneId: sc.id, ids: selection, patch: { hidden: false } })],
    ['Alle verstecken', () => act({ type: 'token.updateMany', sceneId: sc.id, ids: selection, patch: { hidden: true } })],
    ['Sichtbar für …', () => visibilityDialog(toks)],
    npcIds.length > 1 ? ['Als Gruppe in die Porträtleiste', () => groupDialog(npcIds)] : null,
    ['Auswahl aufheben', () => board.clearSelection()],
    ['Alle löschen', async () => {
      if (await dialog({ title: `${toks.length} Figuren löschen?`, okText: 'Löschen', danger: true })) { await act({ type: 'token.delete', sceneId: sc.id, ids: selection }); board.clearSelection(); }
    }, 'danger'],
  ], x, y);
}

function renderSelbar() {
  const bar = $('#selbar');
  if (selection.length < 1) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.replaceChildren(h('span', {}, `${selection.length} markiert`),
    h('button.small.primary', { onclick: (e) => selectionMenu(e.clientX, e.clientY - 200) }, 'Aktionen …'),
    h('button.small', { onclick: () => board.clearSelection() }, 'Aufheben'));
}

async function hpDialog(targets, title) {
  const r = await dialog({
    title: `Schaden / Heilung: ${title}`,
    fields: [{ name: 'amount', label: 'Betrag', type: 'number', value: '', min: 0 }],
    buttons: [{ label: 'Schaden', value: 'damage', cls: 'danger' }, { label: 'Heilung', value: 'heal', cls: 'good' }, { label: 'Temporäre HP', value: 'temp', cls: '' }],
  });
  if (!r || !r.amount) return;
  await act({ type: 'hp.apply', targets, amount: r.amount, mode: r._button || 'damage' });
}

async function visibilityDialog(toks) {
  const sc = editScene();
  const first = toks[0];
  const r = await dialog({
    title: toks.length > 1 ? `Sichtbar für (${toks.length} Figuren)` : `Sichtbar für: ${first.name || 'Figur'}`,
    body: 'Zum Beispiel nach einem Wahrnehmungswurf: nur wer ihn geschafft hat, sieht die Figur. Keiner angehakt = für alle sichtbar.',
    fields: [{ name: 'seats', label: 'Plätze', type: 'checks', value: (first.visibleTo || []).map(String), options: state.seats.map((s) => ({ value: String(s.seat), label: seatLabel(s) })) }],
    okText: 'Übernehmen',
  });
  if (!r) return;
  const visibleTo = r.seats.length ? r.seats.map(Number) : null;
  await act({ type: 'token.updateMany', sceneId: sc.id, ids: toks.map((t) => t.id), patch: { visibleTo, hidden: false } });
}

function drawingMenu(d, x, y) {
  const sc = editScene();
  const upd = (patch) => act({ type: 'drawing.update', sceneId: sc.id, id: d.id, patch });
  showMenu(d.label || { rect: 'Rechteck', ellipse: 'Ellipse', line: 'Linie', image: 'Objekt', template: 'Schablone' }[d.type], [
    ['Bearbeiten …', async () => {
      const fields = [{ name: 'label', label: 'Beschriftung', value: d.label || '' }];
      if (d.type !== 'image') fields.push({ name: 'stroke', label: 'Linienfarbe', type: 'color', value: d.stroke || '#2b2118' });
      if (['rect', 'ellipse', 'template'].includes(d.type)) fields.push({ name: 'fill', label: 'Füllfarbe', type: 'color', value: d.fill || '#8a6d3b' }, { name: 'nofill', label: 'ohne Füllung', type: 'checkbox', value: !d.fill && d.type !== 'template' });
      if (d.type === 'template') fields.push({ name: 'sizeFt', label: 'Größe in Fuß', type: 'number', value: d.sizeFt, step: 5 });
      fields.push({ name: 'opacity', label: 'Deckkraft (0.1–1)', type: 'number', value: d.opacity ?? 1, step: 0.1, min: 0.1, max: 1 });
      const r = await dialog({ title: 'Zeichnung bearbeiten', fields, okText: 'Speichern' });
      if (!r) return;
      const patch = { label: r.label, opacity: r.opacity };
      if ('stroke' in r) patch.stroke = r.stroke;
      if ('fill' in r) patch.fill = r.nofill ? null : r.fill;
      if ('sizeFt' in r) patch.sizeFt = r.sizeFt;
      upd(patch);
    }],
    [d.hidden ? 'Für Spieler zeigen' : 'Vor Spielern verstecken', () => upd({ hidden: !d.hidden })],
    [d.locked ? 'Entsperren' : 'Sperren (nicht verschiebbar)', () => upd({ locked: !d.locked })],
    ['Nach vorne', () => act({ type: 'drawing.order', sceneId: sc.id, id: d.id, where: 'front' })],
    ['Nach hinten', () => act({ type: 'drawing.order', sceneId: sc.id, id: d.id, where: 'back' })],
    ['Löschen', () => act({ type: 'drawing.delete', sceneId: sc.id, id: d.id }), 'danger'],
  ], x, y);
}

async function editToken(t) {
  const sc = editScene();
  const seatOpts = [{ value: '', label: 'niemand (nur DM bewegt)' }, ...state.seats.map((s) => ({ value: String(s.seat), label: seatLabel(s) }))];
  const linkOpts = [{ value: '', label: 'nichts' },
    ...state.characters.map((c) => ({ value: `player:${c.id}`, label: `Spieler: ${c.name}` })),
    ...state.npcs.map((n) => ({ value: `npc:${n.id}`, label: `NPC: ${n.name}` }))];
  const assetOpts = [{ value: '', label: 'kein Bild (Farbe)' }, ...state.assets.map((a) => ({ value: a.id, label: a.name }))];
  const res = await dialog({
    title: 'Figur bearbeiten',
    fields: [
      { name: 'name', label: 'Name (F4)', value: t.name },
      { name: 'label', label: 'Kennung, z. B. 1 oder A (F3)', value: t.label },
      { name: 'assetId', label: 'Bild (F5)', type: 'select', value: t.assetId || '', options: assetOpts },
      { name: 'size', label: 'Größe in Feldern (F9)', type: 'number', step: 0.5, min: 0.5, value: t.size || 1 },
      { name: 'link', label: 'Verknüpft mit (F12)', type: 'select', value: t.refId ? `${t.kind === 'npc' ? 'npc' : 'player'}:${t.refId}` : '', options: linkOpts },
      { name: 'ownerSeat', label: 'Darf bewegen (F7)', type: 'select', value: t.ownerSeat ? String(t.ownerSeat) : '', options: seatOpts },
      { name: 'color', label: 'Farbe ohne Bild', type: 'color', value: t.color || '#8a6d3b' },
    ],
    okText: 'Speichern',
  });
  if (!res) return;
  const [kind, refId] = res.link ? res.link.split(':') : ['marker', null];
  act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: {
    name: res.name, label: res.label, assetId: res.assetId || null, size: res.size, kind, refId,
    ownerSeat: res.ownerSeat ? Number(res.ownerSeat) : null, color: res.color,
  } });
}

async function groupDialog(preselected = []) {
  if (!state.npcs.length) return toast('Noch keine NPCs.', 'error');
  const r = await dialog({
    title: 'Gruppe für die Porträtleiste',
    body: 'Mehrere NPCs teilen sich einen Eintrag, z. B. „Goblins 15“. Einzelne Einträge dieser NPCs wandern in die Gruppe.',
    fields: [
      { name: 'name', label: 'Name', value: 'Goblins' },
      { name: 'value', label: 'Initiativwert (optional)', type: 'number', value: '' },
      { name: 'ids', label: 'NPCs', type: 'checks', value: preselected, options: state.npcs.map((n) => ({ value: n.id, label: n.name })) },
    ],
    okText: 'Gruppe anlegen',
  });
  if (!r || !r.ids.length) return;
  await act({ type: 'initiative.addGroup', name: r.name, refIds: r.ids, value: r.value });
}

// ================================================================ "Tot oder am Boden?" (P5)

function detectDowned(next) {
  const nextMap = new Map(next.npcs.map((n) => [n.id, n.hp.cur]));
  if (state) {
    for (const n of next.npcs) {
      const before = prevNpcHp.get(n.id);
      if (before !== undefined && before > 0 && n.hp.cur <= 0 && !n.dead) downQueue.push(n.id);
    }
  }
  prevNpcHp = nextMap;
  if (!downDialogOpen) askNextDowned();
}

async function askNextDowned() {
  const id = downQueue.shift();
  if (!id) return;
  const n = npc(id) || (state && state.npcs.find((x) => x.id === id));
  if (!n) return askNextDowned();
  downDialogOpen = true;
  const r = await dialog({
    title: `${n.name} ist auf 0 HP`,
    body: 'Tot oder nur am Boden (bewusstlos, z. B. für ein Verhör)? Spieler sehen „tot“ oder „am Boden“.',
    buttons: [{ label: 'Am Boden', value: 'down', cls: '' }, { label: 'Tot', value: 'dead', cls: 'danger' }],
    cancelText: 'Später',
  });
  downDialogOpen = false;
  if (r === 'dead') await act({ type: 'npc.update', id, patch: { dead: true } });
  askNextDowned();
}

// ================================================================ Kopfzeile

$('#editScene').onchange = (e) => { editSceneId = e.target.value; render(); };
$('#goLive').onclick = () => act({ type: 'scene.activate', id: editScene().id });
$('#preview').onchange = async (e) => {
  previewSeat = Number(e.target.value);
  previewView = null;
  board.fittedSceneId = null;
  if (previewSeat) await refreshPreview();
  render();
};
$('#zoomIn').onclick = () => board.zoomBy(1.25);
$('#zoomOut').onclick = () => board.zoomBy(0.8);
$('#zoomFit').onclick = () => board.fit();
$('#panelToggle').onclick = () => document.body.classList.toggle('panel-open');
$$('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; panelDirty = false; renderPanel(true); }; });
$('#panel').addEventListener('focusout', () => setTimeout(() => { if (panelDirty && !panelFocused()) renderPanel(); }, 50));

async function refreshPreview() {
  const r = await conn.request('preview', previewSeat);
  previewView = r && r.ok ? r.view : null;
}

function renderTopbar() {
  const live = scene(state.activeSceneId);
  $('#liveName').textContent = live ? live.name : '–';
  const elsewhere = state.seats.filter((s) => s.sceneId !== state.activeSceneId);
  $('#splitInfo').textContent = elsewhere.length ? ` (Platz ${elsewhere.map((s) => s.seat).join(', ')} woanders)` : '';
  const sel = $('#editScene');
  sel.replaceChildren(...state.scenes.map((s) => h('option', { value: s.id, selected: s.id === editScene().id }, `${s.name}${s.id === state.activeSceneId ? ' (live)' : ''}`)));
  const isLive = editScene().id === state.activeSceneId && !elsewhere.length;
  $('#goLive').disabled = isLive;
  $('#goLive').textContent = isLive ? 'Ist live' : (editScene().id === state.activeSceneId ? 'Alle hierher' : 'Live schalten');
  const pv = $('#preview');
  pv.replaceChildren(h('option', { value: '0' }, 'aus'), ...state.seats.map((s) => h('option', { value: s.seat, selected: s.seat === previewSeat }, `Platz ${s.seat}${s.playerName ? ` (${s.playerName})` : ''}`)));
}

// ================================================================ Gesamtdarstellung

async function render() {
  if (!state) return;
  // Eine gerade angelegte Szene ist evtl. noch nicht im Stand (Antwort kommt vor dem Update):
  // editScene() greift dann kurz auf die Live-Szene zurück, die Auswahl bleibt aber erhalten.
  if (!editSceneId) editSceneId = state.activeSceneId;
  if (previewSeat > state.seats.length) previewSeat = 0;
  renderTopbar();
  updateBanner();
  if (previewSeat) {
    await refreshPreview();
    if (previewView) board.setData(previewView, previewView.scenes[0]);
  } else {
    board.setData(state, editScene());
  }
  renderInitiativeBar();
  renderPanel();
}

function renderInitiativeBar() {
  if (previewSeat && previewView) {
    renderInitiative($('#initiative'), previewView.initiative.entries, { isDM: false, currentId: previewView.initiative.currentId, state: previewView });
    return;
  }
  const entries = state.initiative.entries.map((e) => {
    if (e.kind === 'group') {
      const members = e.refIds.map(npc).filter(Boolean);
      return { ...e, portraitAssetId: members.find((m) => m.portraitAssetId)?.portraitAssetId || null, count: members.length, hiddenNow: !e.visibleSeats.length };
    }
    const src = e.kind === 'npc' ? npc(e.refId) : character(e.refId);
    return { ...e, name: src ? src.name : '?', portraitAssetId: src ? src.portraitAssetId : null,
      condition: e.kind === 'npc' && src ? src.condition : undefined, conditions: src ? src.conditions : [],
      hiddenNow: e.kind !== 'character' && !e.visibleSeats.length };
  });
  renderInitiative($('#initiative'), entries, {
    isDM: true, currentId: state.initiative.currentId, state,
    onReorder: (ids) => act({ type: 'initiative.reorder', ids }),
    onSetCurrent: (id) => act({ type: 'initiative.setCurrent', id }),
    onRemove: (id) => act({ type: 'initiative.remove', id }),
    onNext: () => act({ type: 'initiative.next' }),
    onPrev: () => act({ type: 'initiative.prev' }),
    onSort: () => act({ type: 'initiative.sort', startTop: true }),
    onValue: (id, value) => act({ type: 'initiative.update', id, patch: { value } }),
    onVisibility: (id, visibility) => act({ type: 'initiative.update', id, patch: { visibility } }),
    onClear: async () => { if (await dialog({ title: 'Porträtleiste leeren?', okText: 'Leeren', danger: true })) act({ type: 'initiative.clear' }); },
  });
}

function panelFocused() {
  const a = document.activeElement;
  return $('#tabBody').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
}

function renderPanel(force = false) {
  if (!state) return;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  for (const [id, entry] of sheets) {
    const src = npc(id) || character(id);
    if (src) entry.sheet.update(src, state);
  }
  if (!force && panelFocused()) { panelDirty = true; return; }
  panelDirty = false;
  const body = $('#tabBody');
  const scroll = body.scrollTop;
  body.replaceChildren(...({
    scenes: tabScenes, tokens: tabTokens, players: tabPlayers, npcs: tabNpcs, notes: tabNotes, game: tabGame,
  }[tab])());
  body.scrollTop = scroll;
}

// ================================================================ Tab: Szenen (S1–S8, T2, Nebel)

function tabScenes() {
  const sc = editScene();
  const list = h('ul.list', {}, ...state.scenes.map((s, i) => {
    const here = state.seats.filter((x) => x.sceneId === s.id).length;
    return h(`li${s.id === sc.id ? '.selected' : ''}`, {},
      h('button.link', { onclick: () => { editSceneId = s.id; render(); } }, s.name),
      s.id === state.activeSceneId ? h('span.badge.live', {}, 'live') : null,
      here && s.id !== state.activeSceneId ? h('span.badge', {}, `${here} Spieler`) : null,
      h('span.spacer'),
      h('button.icon', { title: 'Nach oben', disabled: i === 0, onclick: () => moveScene(i, -1) }, '↑'),
      h('button.icon', { title: 'Kopieren', onclick: () => act({ type: 'scene.duplicate', id: s.id }) }, '⧉'),
      h('button.icon', { title: 'Löschen', onclick: async () => {
        if (await dialog({ title: `„${s.name}“ löschen?`, body: 'Alle Figuren und Zeichnungen dieser Szene gehen verloren.', okText: 'Löschen', danger: true })) act({ type: 'scene.delete', id: s.id });
      } }, '🗑'));
  }));

  const update = (patch) => act({ type: 'scene.update', id: sc.id, patch });
  const g = sc.grid;
  const bgAsset = sc.background && state.assets.find((a) => a.id === sc.background.assetId);
  const notes = debounce((v) => update({ notes: v }), 600);

  return [
    h('div.section-head', {}, h('h3', {}, 'Szenen'), h('button.small.primary', { onclick: async () => {
      const r = await dialog({ title: 'Neue Szene', fields: [{ name: 'name', label: 'Name', value: '' }], okText: 'Anlegen' });
      if (r) { const res = await act({ type: 'scene.create', name: r.name }); if (res) { editSceneId = res.id; render(); } }
    } }, '+ Neue Szene')),
    list,
    h('h3', {}, `Einstellungen: ${sc.name}`),
    h('label.field', {}, h('span', {}, 'Name'), h('input', { value: sc.name, onchange: (e) => update({ name: e.target.value }) })),
    h('div.field', {}, h('span', {}, 'Hintergrund'),
      h('div.row', {},
        bgAsset ? h('img.thumb', { src: assetUrl(state, bgAsset.id), alt: '' }) : h('em', {}, 'kein Bild'),
        h('button.small', { onclick: async () => {
          const [a] = await pickAndUploadImages(conn.session, { multiple: false }).catch((e) => { toast(e.message, 'error'); return []; });
          if (a) { await update({ background: { assetId: a.id }, mapScale: 1 }); board.fittedSceneId = null; }
        } }, 'Bild hochladen'),
        state.assets.length ? h('select', { onchange: (e) => { if (e.target.value) { update({ background: { assetId: e.target.value } }); board.fittedSceneId = null; } } },
          h('option', { value: '' }, 'aus Sammlung …'), ...state.assets.map((a) => h('option', { value: a.id }, a.name))) : null,
        bgAsset ? h('button.small', { onclick: () => update({ background: null }) }, 'Entfernen') : null)),
    h('label.field', {}, h('span', {}, `Kartengröße: ${Math.round(sc.mapScale * 100)} %`),
      h('input', { type: 'range', min: 0.1, max: 4, step: 0.01, value: sc.mapScale, onchange: (e) => update({ mapScale: Number(e.target.value) }) })),
    h('fieldset', {}, h('legend', {}, 'Raster'),
      h('label.check', {}, h('input', { type: 'checkbox', checked: g.enabled, onchange: (e) => update({ grid: { enabled: e.target.checked } }) }), 'Raster anzeigen'),
      h('label.check', {}, h('input', { type: 'checkbox', checked: g.snap, onchange: (e) => update({ grid: { snap: e.target.checked } }) }), 'Figuren rasten im Feld ein'),
      h('label.field', {}, h('span', {}, `Feldgröße: ${Math.round(g.size)} px`),
        h('input', { type: 'range', min: 10, max: 300, step: 0.5, value: g.size, oninput: (e) => { e.target.previousSibling.textContent = `Feldgröße: ${Math.round(e.target.value)} px`; }, onchange: (e) => update({ grid: { size: Number(e.target.value) } }) })),
      h('div.row', {},
        h('label.num', {}, h('span', {}, 'Fuß pro Feld'), h('input', { type: 'number', min: 1, value: g.feet, onchange: (e) => update({ grid: { feet: Number(e.target.value) } }) })),
        h('label.num', {}, h('span', {}, 'Versatz X'), h('input', { type: 'number', value: g.offsetX, onchange: (e) => update({ grid: { offsetX: Number(e.target.value) } }) })),
        h('label.num', {}, h('span', {}, 'Versatz Y'), h('input', { type: 'number', value: g.offsetY, onchange: (e) => update({ grid: { offsetY: Number(e.target.value) } }) })),
        h('label.num', {}, h('span', {}, 'Farbe'), h('input', { type: 'color', value: g.color, onchange: (e) => update({ grid: { color: e.target.value } }) }))),
      h('label.field', {}, h('span', {}, 'Deckkraft'), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: g.opacity, onchange: (e) => update({ grid: { opacity: Number(e.target.value) } }) })),
      h('p.hint', {}, 'Tipp: Feldgröße so einstellen, dass ein Feld genau einem Kästchen der Karte entspricht, oder die Kartengröße ändern.')),
    h('fieldset', {}, h('legend', {}, 'Fog of War'),
      h('label.check', {}, h('input', { type: 'checkbox', checked: sc.fog.enabled, onchange: (e) => act({ type: 'fog.update', sceneId: sc.id, patch: { enabled: e.target.checked } }) }), 'Nebel an (Spieler sehen nur Aufgedecktes)'),
      h('div.row.wrap', {},
        h('button.small', { onclick: () => act({ type: 'fog.reset', sceneId: sc.id, mode: 'hideAll' }) }, 'Alles verdecken'),
        h('button.small', { onclick: () => act({ type: 'fog.reset', sceneId: sc.id, mode: 'revealAll' }) }, 'Alles aufdecken'),
        h('button.small', { disabled: !sc.fog.shapes.length, onclick: () => act({ type: 'fog.undo', sceneId: sc.id }) }, 'Rückgängig')),
      h('p.hint', {}, 'Aufdecken und Verdecken mit den Nebel-Werkzeugen links auf der Karte (☀ = aufdecken, ☁ = verdecken). Du siehst den Nebel halb durchsichtig, die Spieler schwarz. Figuren im Nebel kommen bei den Spielern gar nicht erst an.')),
    h('label.check', {}, h('input', { type: 'checkbox', checked: sc.night, onchange: (e) => update({ night: e.target.checked }) }), 'Nachtfilter (S8)'),
    h('label.field', {}, h('span', {}, 'Notiz zur Szene (T2, nur für dich)'),
      h('textarea', { rows: 6, oninput: (e) => notes(e.target.value), placeholder: 'Raumbeschreibung, Fallen, Schätze …' }, sc.notes || '')),
  ];
}

function moveScene(i, dir) {
  const ids = state.scenes.map((s) => s.id);
  const j = i + dir;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  act({ type: 'scene.reorder', ids });
}

// ================================================================ Tab: Figuren (F1–F12)

function tabTokens() {
  const sc = editScene();
  const gallery = h('div.gallery', {}, ...state.assets.map((a) => h('div.asset', {
    draggable: true,
    title: 'Auf die Karte ziehen oder antippen',
    ondragstart: (e) => { e.dataTransfer.setData('text/asset', a.id); e.dataTransfer.effectAllowed = 'copy'; },
  },
  h('button.asset-img', { onclick: () => startPlacing({ kind: 'token', token: { assetId: a.id, name: a.name, kind: 'marker' } }, `„${a.name}“`) },
    h('img', { src: assetUrl(state, a.id), alt: a.name, loading: 'lazy' })),
  h('div.asset-name', {}, a.name),
  h('div.asset-tools', {},
    h('button.icon', { title: 'Umbenennen', onclick: async () => {
      const r = await dialog({ title: 'Bild umbenennen', fields: [{ name: 'name', label: 'Name', value: a.name }] });
      if (r) act({ type: 'asset.rename', id: a.id, name: r.name });
    } }, '✎'),
    h('button.icon', { title: 'Löschen', onclick: async () => {
      if (await dialog({ title: 'Bild löschen?', body: a.name, okText: 'Löschen', danger: true })) act({ type: 'asset.delete', id: a.id });
    } }, '🗑')))));

  const tokens = h('ul.list', {}, ...sc.tokens.map((t) => h(`li${selection.includes(t.id) ? '.selected' : ''}`, {},
    h('span.token-dot', { style: { background: t.color || '#8a6d3b' } }, t.label || ''),
    h('button.link', { onclick: () => editToken(t) }, t.name || '(ohne Name)'),
    t.ownerSeat ? h('span.badge', {}, `Platz ${t.ownerSeat}`) : null,
    Array.isArray(t.visibleTo) ? h('span.badge', { title: 'Nur für bestimmte Plätze sichtbar' }, `👁 ${t.visibleTo.join(',') || '–'}`) : null,
    h('span.spacer'),
    h('button.icon', { title: t.hidden ? 'Aufdecken' : 'Verstecken', onclick: () => act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: { hidden: !t.hidden } }) }, t.hidden ? '🙈' : '👁'),
    h('button.icon', { title: 'Markieren (für Aktionen mit mehreren)', onclick: () => board.toggleSelect(t.id) }, selection.includes(t.id) ? '☑' : '☐'),
    h('button.icon', { title: 'Löschen', onclick: () => act({ type: 'token.delete', sceneId: sc.id, id: t.id }) }, '🗑'))));

  return [
    h('div.section-head', {}, h('h3', {}, 'Bildersammlung'),
      h('button.small.primary', { onclick: async () => {
        try { const list = await pickAndUploadImages(conn.session); if (list.length) toast(`${list.length} Bild(er) hochgeladen`); } catch (e) { toast(e.message, 'error'); }
      } }, '+ Bilder')),
    h('p.hint', {}, 'Bild auf die Karte ziehen oder antippen und dann auf die Karte tippen. Dateien kannst du auch direkt ins Fenster ziehen.'),
    state.assets.length ? gallery : h('p.hint', {}, 'Noch keine Bilder.'),
    h('div.row', {},
      h('button.small', { onclick: () => startPlacing({ kind: 'token', token: { kind: 'marker', name: '', label: '' } }, 'eine Markierung') }, 'Figur ohne Bild setzen'),
      h('button.small', { onclick: placeObject }, 'Objekt setzen (eckig, drehbar)')),
    h('h3', {}, `Figuren in „${sc.name}“`),
    h('p.hint', {}, 'Mehrere markieren: Umschalt + Klick auf Figuren, Umschalt + Rahmen ziehen oder ☐ in der Liste. Rechtsklick (lange drücken) öffnet das Menü.'),
    sc.tokens.length ? tokens : h('p.hint', {}, 'Noch keine Figuren.'),
    h('h3', {}, `Zeichnungen und Objekte (${sc.drawings.length})`),
    sc.drawings.length ? h('ul.list', {}, ...sc.drawings.map((d) => h('li', {},
      h('span', {}, { rect: '▭', ellipse: '◯', line: '✎', image: '🧱', template: '🔥' }[d.type]),
      h('span', {}, d.label || { rect: 'Rechteck', ellipse: 'Ellipse', line: 'Linie', image: 'Objekt', template: `Schablone ${d.sizeFt} ft` }[d.type]),
      d.ownerSeat ? h('span.badge', {}, `Platz ${d.ownerSeat}`) : null,
      h('span.spacer'),
      h('button.icon', { title: d.hidden ? 'Zeigen' : 'Verstecken', onclick: () => act({ type: 'drawing.update', sceneId: sc.id, id: d.id, patch: { hidden: !d.hidden } }) }, d.hidden ? '🙈' : '👁'),
      h('button.icon', { title: 'Löschen', onclick: () => act({ type: 'drawing.delete', sceneId: sc.id, id: d.id }) }, '🗑')))) : h('p.hint', {}, 'Mit den Werkzeugen links auf der Karte zeichnen.'),
  ];
}

// ================================================================ Tab: Spieler (V8, V10, C1–C7, A5, Szene pro Spieler)

function tabPlayers() {
  const sceneOpts = state.scenes.map((s) => ({ value: s.id, label: s.name }));
  const seats = h('ul.list', {}, ...state.seats.map((s) => {
    const c = state.characters.find((x) => x.seat === s.seat);
    return h('li.seat-row', {},
      h('div.seat-line', {},
        h('span', { class: `dot ${s.online ? 'on' : ''}`, title: s.online ? 'online' : 'offline' }),
        h('b', {}, `Platz ${s.seat}`),
        h('span', {}, s.playerName || (s.taken ? '(ohne Namen)' : 'frei')),
        h('span.muted', {}, c ? `– ${c.name}` : ''),
        h('span.spacer'),
        s.taken ? h('button.small', { title: 'Platz freigeben (V10)', onclick: async () => {
          if (await dialog({ title: `Platz ${s.seat} freigeben?`, body: 'Der Spieler wird getrennt und kann sich neu anmelden.', okText: 'Freigeben', danger: true })) act({ type: 'seat.release', seat: s.seat });
        } }, 'Freigeben') : null),
      h('label.seat-scene', {}, h('span', {}, 'Ort:'),
        h('select', { title: 'Wo ist dieser Spieler? (getrennte Gruppen)', onchange: (e) => act({ type: 'seat.setScene', seat: s.seat, sceneId: e.target.value }) },
          ...sceneOpts.map((o) => h('option', { value: o.value, selected: o.value === s.sceneId }, o.label)))));
  }));

  const party = h('div.party', {}, ...state.characters.map((c) => {
    const r = hpRatio(c) ?? 0;
    return h(`button.party-card${selected.players === c.id ? '.selected' : ''}`, { onclick: () => openSheet('players', c.id) },
      c.portraitAssetId ? h('img', { src: assetUrl(state, c.portraitAssetId), alt: '' }) : h('span.ph', {}, initials(c.name)),
      h('span.pname', {}, c.name),
      h('span.hpbar', {}, h('span', { style: { width: `${Math.max(0, Math.min(1, r)) * 100}%` } })),
      h('span.hptext', {}, c.hp.cur <= 0 ? 'am Boden' : `${c.hp.cur}/${c.hp.max}${c.hp.temp ? ` +${c.hp.temp}` : ''}`),
      c.conditions.length ? h('span.mini-dots', {}, ...c.conditions.slice(0, 5).map((x) => h('span', { style: { background: x.color }, title: x.label }))) : null);
  }));

  const out = [
    h('h3', {}, 'Plätze'),
    h('p.hint', {}, 'Mit „Ort“ legst du fest, welche Szene ein Spieler sieht. So kann sich die Gruppe aufteilen. „Live schalten“ holt alle wieder zusammen.'),
    seats,
    h('div.section-head', {}, h('h3', {}, 'Gruppe'),
      h('button.small', { title: 'Alle Spielercharaktere in die Porträtleiste', onclick: async () => {
        // Nur Charaktere, die mitspielen: Platz belegt oder Figur auf einer Karte
        const used = (c) => state.seats.find((s) => s.seat === c.seat)?.taken || state.scenes.some((sc) => sc.tokens.some((t) => t.refId === c.id));
        for (const c of state.characters) if (used(c) && !state.initiative.entries.some((e) => e.refId === c.id)) await act({ type: 'initiative.add', kind: 'character', refId: c.id });
      } }, 'Alle in Leiste')),
    party,
  ];
  const c = selected.players && character(selected.players);
  if (c) out.push(sheetFor('players', c));
  return out;
}

// ================================================================ Tab: NPCs (N1–N8)

function tabNpcs() {
  const list = h('ul.list', {}, ...state.npcs.map((n) => {
    const r = hpRatio(n) ?? 0;
    return h(`li${selected.npcs === n.id ? '.selected' : ''}`, {},
      n.portraitAssetId ? h('img.mini', { src: assetUrl(state, n.portraitAssetId), alt: '' }) : h('span.mini.ph', {}, initials(n.name)),
      h('button.link', { onclick: () => openSheet('npcs', n.id) }, n.name),
      h('span.spacer'),
      n.conditions.length ? h('span.mini-dots', {}, ...n.conditions.slice(0, 4).map((x) => h('span', { style: { background: x.color }, title: x.label }))) : null,
      h('span.hpbar.small', { title: n.condition, style: { outline: `2px solid ${HEALTH_COLORS[n.condition] || 'transparent'}` } }, h('span', { style: { width: `${Math.max(0, Math.min(1, r)) * 100}%` } })),
      h('span.hptext', {}, n.hp.cur <= 0 ? (n.dead ? 'tot' : 'am Boden') : `${n.hp.cur}/${n.hp.max}`));
  }));
  const out = [
    h('div.section-head', {}, h('h3', {}, 'NPCs'),
      h('div.row', {},
        h('button.small', { onclick: () => groupDialog() }, 'Gruppe für Leiste'),
        h('button.small.primary', { onclick: async () => {
          const r = await dialog({ title: 'Neuer NPC', fields: [{ name: 'name', label: 'Name', value: '' }], okText: 'Anlegen' });
          if (r) { const res = await act({ type: 'npc.create', name: r.name }); if (res) openSheet('npcs', res.id); }
        } }, '+ Neuer NPC'))),
    state.npcs.length ? list : h('p.hint', {}, 'Noch keine NPCs. Spieler sehen nie die genauen Werte, nur einen groben Zustand.'),
  ];
  const n = selected.npcs && npc(selected.npcs);
  if (n) out.push(sheetFor('npcs', n));
  return out;
}

// ================================================================ Bögen

function openSheet(kind, id) {
  selected[kind] = id;
  tab = kind;
  document.body.classList.add('panel-open');
  renderPanel(true);
}

function sheetFor(kind, src) {
  let entry = sheets.get(src.id);
  const isNpc = kind === 'npcs';
  if (!entry) {
    const el = h('div.sheet-wrap');
    const sheet = new Sheet(el, {
      kind: isNpc ? 'npc' : 'character',
      showInventory: !isNpc,
      showPrivateNotes: false,
      showNote: isNpc,
      canPickPortrait: true,
      onPickPortrait: () => pickPortrait(isNpc ? 'npc' : 'character', src.id),
      onPatch: (patch) => act({ type: isNpc ? 'npc.update' : 'character.update', id: src.id, patch }),
      onConditions: (list) => act({ type: 'conditions.set', target: { kind: isNpc ? 'npc' : 'character', id: src.id }, conditions: list }),
      actions: sheetActions(kind, src.id),
    });
    entry = { sheet, el };
    sheets.set(src.id, entry);
  }
  entry.sheet.opts.actions = sheetActions(kind, src.id);
  entry.sheet.update(src, state);
  return entry.el;
}

function sheetActions(kind, id) {
  const isNpc = kind === 'npcs';
  const fresh = () => (isNpc ? npc(id) : character(id));
  const src = fresh();
  if (!src) return [];
  const inIni = state.initiative.entries.some((e) => e.refId === id || (e.refIds || []).includes(id));
  const acts = [
    { label: isNpc ? 'Auf Karte setzen …' : 'Figur setzen', title: 'Figur auf die Karte setzen', onClick: async () => {
      const s = fresh();
      if (!isNpc) {
        startPlacing({ kind: 'token', token: { kind: 'player', refId: id, name: s.name, assetId: s.portraitAssetId, ownerSeat: s.seat } }, `„${s.name}“`);
        return;
      }
      // Mehrfach setzen (Vorschlag 6): Anzahl und Kennungen, von Hand änderbar
      const r = await dialog({ title: `„${s.name}“ auf die Karte`, fields: [
        { name: 'count', label: 'Anzahl', type: 'number', value: 1, min: 1, max: 30 },
        { name: 'style', label: 'Kennungen vorschlagen', type: 'select', value: 'num', options: [{ value: 'num', label: '1, 2, 3 …' }, { value: 'abc', label: 'A, B, C …' }, { value: 'none', label: 'keine' }] },
        { name: 'hidden', label: 'Versteckt setzen (z. B. Hinterhalt)', type: 'checkbox', value: false },
      ], okText: 'Weiter' });
      if (!r) return;
      const count = Math.max(1, Math.min(30, r.count || 1));
      const suggestion = Array.from({ length: count }, (_, i) => (r.style === 'abc' ? String.fromCharCode(65 + (i % 26)) : r.style === 'num' ? String(i + 1) : ''));
      const r2 = await dialog({ title: 'Kennungen', body: 'Durch Komma getrennt. Du kannst sie frei ändern (F3).',
        fields: [{ name: 'labels', label: 'Kennungen', value: suggestion.join(', ') }], okText: 'Auf die Karte tippen …' });
      if (!r2) return;
      const labels = r2.labels.split(',').map((x) => x.trim()).slice(0, count);
      while (labels.length < count) labels.push('');
      startPlacing({ kind: 'spawn', npcId: id, labels, hidden: r.hidden }, count > 1 ? `${count}× „${s.name}“` : `„${s.name}“`);
    } },
    inIni ? null : { label: 'In Leiste', title: 'In die Porträtleiste / Initiative aufnehmen', onClick: () => act({ type: 'initiative.add', kind: isNpc ? 'npc' : 'character', refId: id }) },
    { label: '± HP', title: 'Schaden oder Heilung', onClick: () => hpDialog([{ kind: isNpc ? 'npc' : 'character', id }], fresh().name) },
  ];
  if (isNpc) {
    acts.push({ label: 'Kopieren', onClick: async () => {
      const r = await act({ type: 'npc.duplicate', id });
      if (r) openSheet('npcs', r.id);
    } });
    acts.push({ label: 'Löschen', onClick: async () => {
      if (await dialog({ title: `„${fresh().name}“ löschen?`, okText: 'Löschen', danger: true })) {
        await act({ type: 'npc.delete', id }); selected.npcs = null; sheets.delete(id); renderPanel(true);
      }
    } });
  }
  return acts.filter(Boolean);
}

async function pickPortrait(kind, id) {
  const opts = [{ value: '', label: 'kein Bild' }, { value: '__upload', label: 'Neues Bild hochladen …' }, ...state.assets.map((a) => ({ value: a.id, label: a.name }))];
  const src = kind === 'npc' ? npc(id) : character(id);
  const r = await dialog({ title: 'Porträt wählen', fields: [{ name: 'asset', label: 'Bild', type: 'select', value: src.portraitAssetId || '', options: opts }] });
  if (!r) return;
  let assetId = r.asset || null;
  if (assetId === '__upload') {
    const [a] = await pickAndUploadImages(conn.session, { multiple: false }).catch((e) => { toast(e.message, 'error'); return []; });
    if (!a) return;
    assetId = a.id;
  }
  const entry = sheets.get(id);
  if (entry) entry.sheet.signature = '';
  act({ type: kind === 'npc' ? 'npc.update' : 'character.update', id, patch: { portraitAssetId: assetId } });
}

// ================================================================ Tab: Notizen (T1, T4, Gruppenwerte)

function tabNotes() {
  const save = debounce((v) => act({ type: 'dm.notes', text: v }), 600);
  const party = debounce((patch) => act({ type: 'party.update', patch }), 600);
  const p = state.party;
  return [
    h('h3', {}, 'Gruppe (sehen alle)'),
    h('div.row', {},
      h('label.num', {}, h('span', {}, 'XP'), h('input', { type: 'number', min: 0, value: p.xp, onchange: (e) => act({ type: 'party.update', patch: { xp: Number(e.target.value) } }) })),
      h('label.num', {}, h('span', {}, 'Gold / Beute'), h('input', { value: p.gold, onchange: (e) => act({ type: 'party.update', patch: { gold: e.target.value } }) })),
      h('label.num.grow', {}, h('span', {}, 'Spieldatum / Uhrzeit'), h('input', { value: p.date, placeholder: 'z. B. Tag 11, 14 Uhr', onchange: (e) => act({ type: 'party.update', patch: { date: e.target.value } }) }))),
    h('label.field', {}, h('span', {}, 'Gemeinsame Notizen (alle dürfen schreiben)'),
      h('textarea', { rows: 6, oninput: (e) => party({ notes: e.target.value }), placeholder: 'Quests, wichtige Namen, offene Fragen …' }, p.notes || '')),
    h('h3', {}, 'Mein Notizblock (nur für dich)'),
    h('p.hint', {}, 'Notizen zu einzelnen Szenen findest du unter „Szenen“.'),
    h('textarea.big', { rows: 16, oninput: (e) => save(e.target.value), onblur: (e) => act({ type: 'dm.notes', text: e.target.value }) }, state.dmNotes || ''),
  ];
}

// ================================================================ Tab: Spiel (Einladen, Plätze, Speichern, Beenden)

function tabGame() {
  const out = [h('h3', {}, 'Spieler einladen')];
  if (!info) out.push(h('p.hint', {}, 'Lade …'));
  else {
    if (!info.addresses.length) out.push(h('p.hint', {}, 'Keine Netzwerkadresse gefunden. Ist der Rechner mit dem WLAN verbunden?'));
    for (const a of info.addresses) {
      out.push(h('div.invite', {},
        h('img', { src: a.qr, alt: `QR-Code für ${a.url}` }),
        h('div', {}, h('b', {}, a.kind === 'tailscale' ? 'Von zu Hause (Tailscale)' : 'Am selben Tisch (WLAN)'), h('br'), h('code', {}, a.url),
          h('p.hint', {}, a.kind === 'tailscale' ? 'Spieler brauchen Tailscale und müssen in deinem Tailscale-Netz sein.' : 'Handy ins selbe WLAN, QR-Code scannen.'))));
    }
    out.push(h('div.row', {},
      h('label.num', {}, h('span', {}, 'Raum-PIN'), h('input', { value: info.pin || '', placeholder: 'keine', onchange: async (e) => {
        await act({ type: 'settings.update', patch: { pin: e.target.value } });
        info.pin = e.target.value.trim();
        toast(info.pin ? `PIN ist jetzt ${info.pin}` : 'PIN entfernt');
      } })),
      h('label.num', {}, h('span', {}, 'Anzahl Spielerplätze'), h('input', { type: 'number', min: 1, max: info.maxSeats || 20, value: state.seats.length, onchange: async (e) => {
        const r = await act({ type: 'settings.update', patch: { seatCount: Number(e.target.value) } });
        if (r) toast(`Jetzt ${r.seatCount} Plätze`); else e.target.value = state.seats.length;
      } })),
      h('p.hint', {}, `Die PIN brauchen nur neue Spieler. Plätze: 1 bis ${info.maxSeats || 20}; belegte Plätze werden beim Verkleinern nicht entfernt.`)));
  }

  const lastSaved = info && info.lastSaved ? new Date(info.lastSaved).toLocaleTimeString('de-DE') : 'noch nicht';
  out.push(
    h('h3', {}, 'Speichern und Laden'),
    h('p', {}, `Automatisch gespeichert wird alle ${info ? info.autosaveMinutes : 5} Minuten. Zuletzt: ${lastSaved}.`),
    h('div.row.wrap', {},
      h('button.small', { onclick: async () => { const r = await conn.request('save.now'); if (r && r.ok) { info.lastSaved = r.lastSaved; toast('Gespeichert'); renderPanel(true); } } }, 'Jetzt speichern'),
      h('a.button.small.primary', { href: `/api/export?session=${encodeURIComponent(conn.session)}`, download: '' }, 'Spielstand herunterladen'),
      h('button.small', { onclick: importSave }, 'Spielstand laden')),
    h('p.hint', {}, 'Die ZIP-Datei enthält alles: Szenen, Bilder, Figuren, Zeichnungen, Nebel, Werte, Inventare und Notizen. Du kannst sie auch auf einem anderen Rechner laden.'),
    info ? h('p.hint', {}, 'Spielstand-Ordner: ', h('code', {}, info.dataDir)) : null,
    h('h3', {}, 'Beenden'),
    h('button.small.danger', { disabled: !(info && info.canShutdown), onclick: async () => {
      if (!(await dialog({ title: 'Server beenden?', body: 'Der Spielstand wird gespeichert, alle Spieler werden getrennt.', okText: 'Beenden', danger: true }))) return;
      const r = await conn.request('server.shutdown');
      if (!r || !r.ok) toast((r && r.error) || 'Beenden nicht möglich', 'error');
    } }, 'Server beenden'),
  );
  return out;
}

async function importSave() {
  const file = await new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: '.zip,application/zip' });
    input.onchange = () => resolve(input.files[0]);
    input.click();
  });
  if (!file) return;
  if (!(await dialog({ title: 'Spielstand laden?', body: `„${file.name}“ ersetzt den aktuellen Stand komplett. Lade vorher den aktuellen Stand herunter, falls du ihn behalten willst.`, okText: 'Laden', danger: true }))) return;
  const res = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/zip', 'x-session': conn.session }, body: file });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return toast(body.error || 'Laden fehlgeschlagen', 'error');
  sheets.clear();
  selected = { players: null, npcs: null };
  editSceneId = null;
  board.fittedSceneId = null;
  prevNpcHp = new Map();
  toast('Spielstand geladen');
}

// Bilder per Drag & Drop direkt aus dem Dateimanager hochladen
document.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', async (e) => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  const imgs = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
  for (const f of imgs) {
    try { await uploadImage(conn.session, f); } catch (err) { toast(err.message, 'error'); }
  }
  if (imgs.length) { toast(`${imgs.length} Bild(er) in die Sammlung geladen`); tab = 'tokens'; renderPanel(true); }
});

renderToolbar();
start();

// Für automatische Tests (Koordinaten der Karte): window.dnd.board
window.dnd = { board };
