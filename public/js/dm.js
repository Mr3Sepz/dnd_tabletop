// DM-Ansicht (A1): alle Werkzeuge in der Seitenleiste, Karte in der Mitte.

import { $, $$, h, toast, dialog, debounce, assetUrl, initials, pickAndUploadImages, uploadImage } from './util.js';
import { connect } from './net.js';
import { Board } from './board.js';
import { Sheet } from './sheet.js';
import { renderInitiative } from './initiative.js';

let conn;
let state = null;        // DM-Sicht vom Server
let info = null;         // Adressen, QR-Codes, PIN
let editSceneId = null;  // welche Szene der DM gerade bearbeitet (S4)
let previewSeat = 0;     // "Als Spieler ansehen" (A4)
let tab = 'scenes';
let placing = null;      // Vorlage für die nächste Figur (F1: von Hand setzen)
let selected = { players: null, npcs: null }; // geöffneter Bogen
const sheets = new Map(); // id -> { sheet, el }
let panelDirty = false;

// ---------------------------------------------------------------- Start

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
    onState: (s) => { state = s; render(); },
    onInfo: (i) => { info = i; if (tab === 'game') renderPanel(); },
    onSaved: (i) => { if (info) info.lastSaved = i.lastSaved; if (tab === 'game') renderPanel(); },
    onTokenMoved: (m) => {
      const sc = state && state.scenes.find((s) => s.id === m.sceneId);
      const t = sc && sc.tokens.find((x) => x.id === m.id);
      if (t) { t.x = m.x; t.y = m.y; }
      if (boardSceneId() === m.sceneId) board.moveToken(m.id, m.x, m.y);
    },
  });
}

// ---------------------------------------------------------------- Hilfen

const scene = (id) => state.scenes.find((s) => s.id === id);
const editScene = () => scene(editSceneId) || scene(state.activeSceneId);
const boardSceneId = () => (previewSeat ? state.activeSceneId : editScene()?.id);
const npc = (id) => state.npcs.find((n) => n.id === id);
const character = (id) => state.characters.find((c) => c.id === id);
const act = (a) => conn.act(a);

function tokenSource(t) {
  if (t.kind === 'npc' && t.refId) return npc(t.refId);
  if (t.kind === 'player' && t.refId) return character(t.refId);
  return null;
}

function hpRatio(src) {
  return src && src.hp && src.hp.max > 0 ? src.hp.cur / src.hp.max : null;
}

// ---------------------------------------------------------------- Karte

const board = new Board($('#board'), {
  showHpBars: true,
  canDrag: () => !previewSeat,
  onMove: (t, x, y, final) => act({ type: 'token.move', sceneId: boardSceneId(), id: t.id, x, y, final }),
  onTokenClick: (t) => {
    if (previewSeat) return;
    if (t.kind === 'npc' && t.refId && npc(t.refId)) openSheet('npcs', t.refId);
    else if (t.kind === 'player' && t.refId && character(t.refId)) openSheet('players', t.refId);
  },
  onTokenContext: (t, x, y) => { if (!previewSeat) tokenMenu(t, x, y); },
  onBackgroundClick: (pos) => { hideMenu(); if (placing) placeToken(pos); },
  tokenInfo: (t) => {
    const src = tokenSource(t);
    if (previewSeat) {
      // Vorschau: nur das, was der Spieler auch sieht (grober Zustand, N8)
      return t.kind === 'npc' && src ? { condition: src.condition, defeated: src.hp.cur <= 0 } : {};
    }
    return { hpRatio: hpRatio(src), defeated: t.kind === 'npc' && src && src.hp.cur <= 0 };
  },
});

// Bilder aus der Sammlung auf die Karte ziehen (F1, F11)
$('#board').addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/asset')) e.preventDefault(); });
$('#board').addEventListener('drop', (e) => {
  const assetId = e.dataTransfer.getData('text/asset');
  if (!assetId) return;
  e.preventDefault();
  const a = state.assets.find((x) => x.id === assetId);
  placing = { assetId, name: a ? a.name : '', kind: 'marker' };
  placeToken(board.worldFromClient(e.clientX, e.clientY));
});

function snap(pos, sc, size = 1) {
  const g = sc.grid;
  if (!g.enabled) return pos;
  const off = size % 2 === 1 || size < 1 ? 0.5 : 0; // ungerade Größen in die Feldmitte
  return {
    x: Math.round((pos.x - g.offsetX) / g.size - off) * g.size + g.offsetX + off * g.size,
    y: Math.round((pos.y - g.offsetY) / g.size - off) * g.size + g.offsetY + off * g.size,
  };
}

async function placeToken(pos) {
  const sc = editScene();
  const tpl = placing;
  placing = null;
  updateBanner();
  const p = snap(pos, sc, tpl.size || 1);
  await act({ type: 'token.create', sceneId: sc.id, token: { ...tpl, x: p.x, y: p.y } });
}

function startPlacing(tpl, what) {
  placing = tpl;
  if (window.matchMedia('(max-width: 900px)').matches) document.body.classList.remove('panel-open');
  updateBanner(`Tippe auf die Karte, um ${what} zu setzen.`);
}

function updateBanner(msg) {
  const b = $('#banner');
  const parts = [];
  if (previewSeat) parts.push(h('span', {}, `Vorschau: So sieht Platz ${previewSeat} die Karte. Bearbeiten ist aus.`));
  else if (state && editScene() && editScene().id !== state.activeSceneId) {
    parts.push(h('span', {}, `Du bearbeitest „${editScene().name}“. Die Spieler sehen weiter „${scene(state.activeSceneId).name}“.`));
  }
  if (msg || placing) parts.push(h('span', {}, msg || 'Figur setzen: auf die Karte tippen.'), h('button.small', { onclick: () => { placing = null; updateBanner(); } }, 'Abbrechen'));
  b.replaceChildren(...parts);
  b.classList.toggle('hidden', parts.length === 0);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { placing = null; hideMenu(); updateBanner(); } });

// ---------------------------------------------------------------- Kontextmenü (F8)

function hideMenu() { $('#ctxMenu').classList.add('hidden'); }

function tokenMenu(t, x, y) {
  const sc = editScene();
  const src = tokenSource(t);
  const items = [
    ['Bearbeiten …', () => editToken(t)],
    [t.hidden ? 'Aufdecken (für Spieler sichtbar)' : 'Verstecken (nur du siehst sie)', () => act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: { hidden: !t.hidden } })],
    src ? ['Werte öffnen', () => openSheet(t.kind === 'npc' ? 'npcs' : 'players', src.id)] : null,
    src && !state.initiative.entries.some((e) => e.refId === src.id) ? ['In Porträtleiste', () => act({ type: 'initiative.add', kind: t.kind === 'npc' ? 'npc' : 'character', refId: src.id })] : null,
    ['Größer', () => act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: { size: (t.size || 1) + 0.5 } })],
    ['Kleiner', () => act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: { size: Math.max(0.5, (t.size || 1) - 0.5) } })],
    ['Kopieren', () => act({ type: 'token.duplicate', sceneId: sc.id, id: t.id })],
    ['Nach vorne', () => act({ type: 'token.toFront', sceneId: sc.id, id: t.id })],
    ['Löschen', async () => {
      if (await dialog({ title: 'Figur löschen?', body: t.name || t.label || 'Diese Figur', okText: 'Löschen', danger: true })) act({ type: 'token.delete', sceneId: sc.id, id: t.id });
    }, 'danger'],
  ].filter(Boolean);
  const menu = $('#ctxMenu');
  menu.replaceChildren(h('div.ctx-title', {}, t.name || t.label || 'Figur'),
    ...items.map(([label, fn, cls]) => h(`button${cls ? '.' + cls : ''}`, { onclick: () => { hideMenu(); fn(); } }, label)));
  menu.classList.remove('hidden');
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
}
document.addEventListener('pointerdown', (e) => { if (!$('#ctxMenu').contains(e.target)) hideMenu(); });

async function editToken(t) {
  const sc = editScene();
  const seatOpts = [{ value: '', label: 'niemand (nur DM bewegt)' }, ...state.seats.map((s) => ({ value: String(s.seat), label: `Platz ${s.seat}${s.playerName ? ` – ${s.playerName}` : ''}` }))];
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

// ---------------------------------------------------------------- Kopfzeile

$('#editScene').onchange = (e) => { editSceneId = e.target.value; render(); };
$('#goLive').onclick = () => act({ type: 'scene.activate', id: editScene().id });
$('#preview').onchange = (e) => { previewSeat = Number(e.target.value); board.fittedSceneId = null; render(); };
$('#zoomIn').onclick = () => board.zoomBy(1.25);
$('#zoomOut').onclick = () => board.zoomBy(0.8);
$('#zoomFit').onclick = () => board.fit();
$('#panelToggle').onclick = () => document.body.classList.toggle('panel-open');
$$('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; panelDirty = false; renderPanel(true); }; });
$('#panel').addEventListener('focusout', () => setTimeout(() => { if (panelDirty && !panelFocused()) renderPanel(); }, 50));

function renderTopbar() {
  const live = scene(state.activeSceneId);
  $('#liveName').textContent = live ? live.name : '–';
  const sel = $('#editScene');
  sel.replaceChildren(...state.scenes.map((s) => h('option', { value: s.id, selected: s.id === editScene().id }, `${s.name}${s.id === state.activeSceneId ? ' (live)' : ''}`)));
  $('#goLive').disabled = editScene().id === state.activeSceneId;
  $('#goLive').textContent = editScene().id === state.activeSceneId ? 'Ist live' : 'Live schalten';
  const pv = $('#preview');
  pv.replaceChildren(h('option', { value: '0' }, 'aus'), ...state.seats.map((s) => h('option', { value: s.seat, selected: s.seat === previewSeat }, `Platz ${s.seat}${s.playerName ? ` (${s.playerName})` : ''}`)));
}

// ---------------------------------------------------------------- Gesamtdarstellung

function render() {
  if (!state) return;
  if (!editSceneId || !scene(editSceneId)) editSceneId = state.activeSceneId;
  renderTopbar();
  updateBanner();

  let sc = scene(boardSceneId());
  if (previewSeat) sc = { ...sc, tokens: sc.tokens.filter((t) => !t.hidden) };
  board.setData(state, sc);

  renderInitiativeBar();
  renderPanel();
}

function renderInitiativeBar() {
  const entries = state.initiative.entries.map((e) => {
    const src = e.kind === 'npc' ? npc(e.refId) : character(e.refId);
    return { ...e, name: src ? src.name : '?', portraitAssetId: src ? src.portraitAssetId : null,
      condition: e.kind === 'npc' && src ? src.condition : undefined };
  });
  renderInitiative($('#initiative'), entries, {
    isDM: !previewSeat, current: state.initiative.current, state,
    onReorder: (ids) => act({ type: 'initiative.reorder', ids }),
    onSetCurrent: (id) => act({ type: 'initiative.setCurrent', id }),
    onRemove: (id) => act({ type: 'initiative.remove', id }),
    onNext: () => act({ type: 'initiative.next' }),
    onPrev: () => act({ type: 'initiative.prev' }),
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
  // Bögen aktualisieren sich selbst, ohne Fokus zu verlieren.
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

// ---------------------------------------------------------------- Tab: Szenen (S1–S8, T2)

function tabScenes() {
  const sc = editScene();
  const list = h('ul.list', {}, ...state.scenes.map((s, i) => h(`li${s.id === sc.id ? '.selected' : ''}`, {},
    h('button.link', { onclick: () => { editSceneId = s.id; render(); } }, s.name),
    s.id === state.activeSceneId ? h('span.badge.live', {}, 'live') : null,
    h('span.spacer'),
    h('button.icon', { title: 'Nach oben', disabled: i === 0, onclick: () => moveScene(i, -1) }, '↑'),
    h('button.icon', { title: 'Kopieren', onclick: () => act({ type: 'scene.duplicate', id: s.id }) }, '⧉'),
    h('button.icon', { title: 'Löschen', onclick: async () => {
      if (await dialog({ title: `„${s.name}“ löschen?`, body: 'Alle Figuren dieser Szene gehen verloren.', okText: 'Löschen', danger: true })) act({ type: 'scene.delete', id: s.id });
    } }, '🗑'))));

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
    h('div.field', {}, h('span', {}, 'Hintergrund (S1, S5)'),
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
      h('label.field', {}, h('span', {}, `Feldgröße: ${Math.round(g.size)} px`),
        h('input', { type: 'range', min: 10, max: 300, step: 0.5, value: g.size, oninput: (e) => { e.target.previousSibling.textContent = `Feldgröße: ${Math.round(e.target.value)} px`; }, onchange: (e) => update({ grid: { size: Number(e.target.value) } }) })),
      h('div.row', {},
        h('label.num', {}, h('span', {}, 'Versatz X'), h('input', { type: 'number', value: g.offsetX, onchange: (e) => update({ grid: { offsetX: Number(e.target.value) } }) })),
        h('label.num', {}, h('span', {}, 'Versatz Y'), h('input', { type: 'number', value: g.offsetY, onchange: (e) => update({ grid: { offsetY: Number(e.target.value) } }) })),
        h('label.num', {}, h('span', {}, 'Farbe'), h('input', { type: 'color', value: g.color, onchange: (e) => update({ grid: { color: e.target.value } }) }))),
      h('label.field', {}, h('span', {}, 'Deckkraft'), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: g.opacity, onchange: (e) => update({ grid: { opacity: Number(e.target.value) } }) })),
      h('p.hint', {}, 'Tipp: Feldgröße so einstellen, dass ein Feld genau einem Kästchen der Karte entspricht. Alternativ die Kartengröße ändern.')),
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

// ---------------------------------------------------------------- Tab: Figuren (F1–F12)

function tabTokens() {
  const sc = editScene();
  const gallery = h('div.gallery', {}, ...state.assets.map((a) => h('div.asset', {
    draggable: true,
    title: 'Auf die Karte ziehen oder antippen',
    ondragstart: (e) => { e.dataTransfer.setData('text/asset', a.id); e.dataTransfer.effectAllowed = 'copy'; },
  },
  h('button.asset-img', { onclick: () => startPlacing({ assetId: a.id, name: a.name, kind: 'marker' }, `„${a.name}“`) },
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

  const tokens = h('ul.list', {}, ...sc.tokens.map((t) => h('li', {},
    h('span.token-dot', { style: { background: t.color || '#8a6d3b' } }, t.label || ''),
    h('button.link', { onclick: () => editToken(t) }, t.name || '(ohne Name)'),
    t.ownerSeat ? h('span.badge', {}, `Platz ${t.ownerSeat}`) : null,
    h('span.spacer'),
    h('button.icon', { title: t.hidden ? 'Aufdecken' : 'Verstecken', onclick: () => act({ type: 'token.update', sceneId: sc.id, id: t.id, patch: { hidden: !t.hidden } }) }, t.hidden ? '🙈' : '👁'),
    h('button.icon', { title: 'Kopieren', onclick: () => act({ type: 'token.duplicate', sceneId: sc.id, id: t.id }) }, '⧉'),
    h('button.icon', { title: 'Löschen', onclick: () => act({ type: 'token.delete', sceneId: sc.id, id: t.id }) }, '🗑'))));

  return [
    h('div.section-head', {}, h('h3', {}, 'Bildersammlung (F11)'),
      h('button.small.primary', { onclick: async () => {
        try { const list = await pickAndUploadImages(conn.session); if (list.length) toast(`${list.length} Bild(er) hochgeladen`); } catch (e) { toast(e.message, 'error'); }
      } }, '+ Bilder')),
    h('p.hint', {}, 'Bild auf die Karte ziehen oder antippen und dann auf die Karte tippen.'),
    state.assets.length ? gallery : h('p.hint', {}, 'Noch keine Bilder.'),
    h('div.row', {},
      h('button.small', { onclick: () => startPlacing({ kind: 'marker', name: '', label: '' }, 'eine Markierung') }, 'Figur ohne Bild setzen')),
    h('h3', {}, `Figuren in „${sc.name}“`),
    sc.tokens.length ? tokens : h('p.hint', {}, 'Noch keine Figuren. Rechtsklick oder lange drücken auf eine Figur öffnet ihr Menü.'),
  ];
}

// ---------------------------------------------------------------- Tab: Spieler (V8, V10, C1–C7, A5)

function tabPlayers() {
  const seats = h('ul.list', {}, ...state.seats.map((s) => {
    const c = state.characters.find((x) => x.seat === s.seat);
    return h('li', {},
      h('span', { class: `dot ${s.online ? 'on' : ''}`, title: s.online ? 'online' : 'offline' }),
      h('b', {}, `Platz ${s.seat}`),
      h('span', {}, s.playerName || (s.taken ? '(ohne Namen)' : 'frei')),
      h('span.muted', {}, c ? `– ${c.name}` : ''),
      h('span.spacer'),
      s.taken ? h('button.small', { title: 'Platz freigeben (V10)', onclick: async () => {
        if (await dialog({ title: `Platz ${s.seat} freigeben?`, body: 'Der Spieler wird getrennt und kann sich neu anmelden.', okText: 'Freigeben', danger: true })) act({ type: 'seat.release', seat: s.seat });
      } }, 'Freigeben') : null);
  }));

  const party = h('div.party', {}, ...state.characters.map((c) => {
    const r = hpRatio(c) ?? 0;
    return h(`button.party-card${selected.players === c.id ? '.selected' : ''}`, { onclick: () => openSheet('players', c.id) },
      c.portraitAssetId ? h('img', { src: assetUrl(state, c.portraitAssetId), alt: '' }) : h('span.ph', {}, initials(c.name)),
      h('span.pname', {}, c.name),
      h('span.hpbar', {}, h('span', { style: { width: `${Math.max(0, Math.min(1, r)) * 100}%` } })),
      h('span.hptext', {}, `${c.hp.cur}/${c.hp.max}${c.hp.temp ? ` +${c.hp.temp}` : ''}`));
  }));

  const out = [h('h3', {}, 'Plätze (V8)'), seats, h('h3', {}, 'Gruppe (C1)'), party];
  const c = selected.players && character(selected.players);
  if (c) out.push(sheetFor('players', c));
  return out;
}

// ---------------------------------------------------------------- Tab: NPCs (N1–N8)

function tabNpcs() {
  const list = h('ul.list', {}, ...state.npcs.map((n) => {
    const r = hpRatio(n) ?? 0;
    return h(`li${selected.npcs === n.id ? '.selected' : ''}`, {},
      n.portraitAssetId ? h('img.mini', { src: assetUrl(state, n.portraitAssetId), alt: '' }) : h('span.mini.ph', {}, initials(n.name)),
      h('button.link', { onclick: () => openSheet('npcs', n.id) }, n.name),
      h('span.spacer'),
      h('span.hpbar.small', { title: n.condition }, h('span', { style: { width: `${Math.max(0, Math.min(1, r)) * 100}%` } })),
      h('span.hptext', {}, `${n.hp.cur}/${n.hp.max}`));
  }));
  const out = [
    h('div.section-head', {}, h('h3', {}, 'NPCs'), h('button.small.primary', { onclick: async () => {
      const r = await dialog({ title: 'Neuer NPC', fields: [{ name: 'name', label: 'Name', value: '' }], okText: 'Anlegen' });
      if (r) { const res = await act({ type: 'npc.create', name: r.name }); if (res) openSheet('npcs', res.id); }
    } }, '+ Neuer NPC')),
    state.npcs.length ? list : h('p.hint', {}, 'Noch keine NPCs. Spieler sehen nie die genauen Werte, nur einen groben Zustand.'),
  ];
  const n = selected.npcs && npc(selected.npcs);
  if (n) out.push(sheetFor('npcs', n));
  return out;
}

// ---------------------------------------------------------------- Bögen

function openSheet(kind, id) {
  selected[kind] = id;
  tab = kind;
  document.body.classList.add('panel-open');
  renderPanel(true);
}

function sheetFor(kind, src) {
  let entry = sheets.get(src.id);
  if (!entry) {
    const el = h('div.sheet-wrap');
    const isNpc = kind === 'npcs';
    const sheet = new Sheet(el, {
      kind: isNpc ? 'npc' : 'character',
      showInventory: !isNpc,
      showPrivateNotes: false,
      showNote: isNpc,
      canPickPortrait: true,
      onPickPortrait: () => pickPortrait(isNpc ? 'npc' : 'character', src.id),
      onPatch: (patch) => act({ type: isNpc ? 'npc.update' : 'character.update', id: src.id, patch }),
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
  const src = isNpc ? npc(id) : character(id);
  if (!src) return [];
  const inIni = state.initiative.entries.some((e) => e.refId === id);
  const fresh = () => (isNpc ? npc(id) : character(id)) || src; // aktueller Stand beim Klick
  const acts = [
    { label: 'Figur setzen', title: 'Figur für diesen Charakter auf die Karte setzen', onClick: () => {
      const s = fresh();
      startPlacing({
        kind: isNpc ? 'npc' : 'player', refId: id, name: s.name, assetId: s.portraitAssetId,
        ownerSeat: isNpc ? null : s.seat,
      }, `„${s.name}“`);
    } },
    inIni ? null : { label: 'In Leiste', title: 'In die Porträtleiste / Initiative aufnehmen', onClick: () => act({ type: 'initiative.add', kind: isNpc ? 'npc' : 'character', refId: id }) },
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

// ---------------------------------------------------------------- Tab: Notizen (T1)

function tabNotes() {
  const save = debounce((v) => act({ type: 'dm.notes', text: v }), 600);
  return [
    h('h3', {}, 'Mein Notizblock (T1)'),
    h('p.hint', {}, 'Nur für dich. Notizen zu einzelnen Szenen findest du unter „Szenen“.'),
    h('textarea.big', { rows: 20, oninput: (e) => save(e.target.value), onblur: (e) => act({ type: 'dm.notes', text: e.target.value }) }, state.dmNotes || ''),
  ];
}

// ---------------------------------------------------------------- Tab: Spiel (V2, V3, L1–L5)

function tabGame() {
  const out = [h('h3', {}, 'Spieler einladen (V2)')];
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
      h('label.num', {}, h('span', {}, 'Raum-PIN (V3)'), h('input', { value: info.pin || '', placeholder: 'keine', onchange: async (e) => {
        await act({ type: 'settings.update', patch: { pin: e.target.value } });
        info.pin = e.target.value.trim();
        toast(info.pin ? `PIN ist jetzt ${info.pin}` : 'PIN entfernt');
      } })),
      h('p.hint', {}, 'Die PIN brauchen nur neue Spieler. Wer schon drin ist, bleibt drin.')));
  }

  const lastSaved = info && info.lastSaved ? new Date(info.lastSaved).toLocaleTimeString('de-DE') : 'noch nicht';
  out.push(
    h('h3', {}, 'Speichern und Laden'),
    h('p', {}, `Automatisch gespeichert wird alle ${info ? info.autosaveMinutes : 5} Minuten (L1). Zuletzt: ${lastSaved}.`),
    h('div.row.wrap', {},
      h('button.small', { onclick: async () => { const r = await conn.request('save.now'); if (r && r.ok) { info.lastSaved = r.lastSaved; toast('Gespeichert'); renderPanel(true); } } }, 'Jetzt speichern'),
      h('a.button.small.primary', { href: `/api/export?session=${encodeURIComponent(conn.session)}`, download: '' }, 'Spielstand herunterladen (L3)'),
      h('button.small', { onclick: importSave }, 'Spielstand laden (L4)')),
    h('p.hint', {}, 'Die heruntergeladene ZIP-Datei enthält alles: Szenen, Bilder, Figuren, Werte, Inventare und Notizen. Du kannst sie auch auf einem anderen Rechner laden (L5).'),
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

start();
