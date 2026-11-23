// Spieleransicht (A2): eigene Szene, eigene Figuren bewegen, eigener Bogen mit
// privatem Notizbuch, Zuständen und Todesrettungswürfen; Attribute und Fertigkeiten;
// Inventar mit Waffen und Zaubern; Tagebuch/Questlog und gemeinsame Notizen;
// Würfel, Chat, Weltkarte, Messen und eigene Zauberschablonen.

import { $, $$, h, debounce, dialog, setupViewToggles } from './util.js';
import { InventoryEditor, coinImage } from './inventory.js';
import { connect, storedSeat } from './net.js';
import { Board, TOOLS } from './board.js';
import { Sheet } from './sheet.js';
import { renderInitiative } from './initiative.js';
import { DicePanel } from './dice.js';
import { AbilitySheet } from './charsheet.js';
import { QuestLog } from './quests.js';
import { ChatPanel } from './chat.js';
import { WorldMap } from './worldmap.js';
import { setHelpOverrides } from './help.js';

const params = new URLSearchParams(location.search);
const seat = Number(params.get('seat')) || storedSeat()?.seat;
if (!seat) location.href = '/';

let join = {};
try { join = JSON.parse(sessionStorage.getItem('dnd.join') || '{}'); } catch { /* egal */ }
if (join.seat !== seat) join = {};

let state = null;
let sheet = null;
let inv = null;
let abilities = null;
let tab = 'sheet';

const sceneId = () => state && state.scenes[0] && state.scenes[0].id;

const board = new Board($('#board'), {
  isDM: false,
  showHpBars: false,
  canDrag: (t) => t.ownerSeat === seat,
  onMove: (t, x, y, final) => conn.act({ type: 'token.move', sceneId: sceneId(), id: t.id, x, y, final }),
  onTokenClick: (t) => { if (t.ownerSeat === seat) openPanel('sheet'); },
  tokenInfo: (t) => ({
    health: t.kind === 'npc' ? t.condition : null,
    conditions: t.conditions || [],
    down: t.condition === 'am Boden' || t.down,
    dead: t.condition === 'tot',
  }),
  // Eigene Zauberschablonen verschieben, drehen, löschen
  canEditDrawing: (d) => d.ownerSeat === seat,
  onDrawingChange: (d, patch) => conn.act({ type: 'drawing.update', sceneId: sceneId(), id: d.id, patch }),
  onDrawingContext: async (d) => {
    if (d.ownerSeat !== seat) return;
    if (await dialog({ title: 'Schablone entfernen?', okText: 'Entfernen', danger: true })) conn.act({ type: 'drawing.delete', sceneId: sceneId(), id: d.id });
  },
  onCreateDrawing: (d) => conn.act({ type: 'drawing.create', sceneId: sceneId(), drawing: d }),
  onToolDone: () => renderToolbar(),
});

const conn = connect({ mode: 'player', seat, pin: join.pin, playerName: join.playerName }, {
  onJoined: () => { sessionStorage.removeItem('dnd.join'); },
  onJoinError: (err) => gone('Beitritt nicht möglich', err),
  onKicked: (k) => gone('Platz freigegeben', k.reason),
  onStopping: () => gone('Spiel beendet', 'Der DM hat den Server beendet.'),
  onConnection: (ok) => $('#conn').classList.toggle('on', ok),
  onState: (s) => { state = s; setHelpOverrides(s.helpTexts); dice.setLog(s.diceLog || []); render(); },
  onChat: (m) => chat.receive(m),
  onChatHistory: (list) => chat.setHistory(list),
  onTokenMoved: (m) => board.moveToken(m.id, m.x, m.y),
  onDice: (r) => dice.announce(r),
});

const dice = new DicePanel({ isDM: false, act: (a) => conn.act(a) });
const seatName = (n) => {
  const c = state && state.characters.find((x) => x.seat === n);
  const st = state && state.seats.find((x) => x.seat === n);
  return c ? `${c.name}${st && st.playerName ? ` (${st.playerName})` : ''}` : `Platz ${n}`;
};
const chat = new ChatPanel({
  me: seat, conn,
  people: () => [{ id: 'dm', label: 'DM' }, ...(state ? state.seats.filter((x) => x.seat !== seat && x.taken).map((x) => ({ id: x.seat, label: seatName(x.seat) })) : [])],
});
const world = new WorldMap({ isDM: false, mySeat: seat, act: (a) => conn.act(a), seatName });
$('#worldBtn').onclick = () => { world.update(state); world.open(); };
const quests = new QuestLog(h('div.quest-wrap'), { act: (a) => conn.act(a), who: (by) => (by === 'dm' ? 'DM' : by === seat ? 'dir' : seatName(by)) });

function gone(title, msg) {
  conn.socket.close();
  $('#goneTitle').textContent = title;
  $('#goneMsg').textContent = msg;
  $('#gone').classList.remove('hidden');
}

function renderToolbar() {
  const tool = board.tool;
  const btn = (key, icon) => h(`button.tool${tool === key ? '.active' : ''}`, { title: TOOLS[key], onclick: () => { board.setTool(key); renderToolbar(); } }, icon);
  $('#toolbar').replaceChildren(
    btn('select', '🖐'), btn('measure', '📏'),
    h('button.tool', { title: 'Zauberschablone legen', onclick: placeTemplate }, '🔥'),
  );
}

async function placeTemplate() {
  const r = await dialog({ title: 'Zauberschablone', fields: [
    { name: 'shape', label: 'Form', type: 'select', value: 'circle', options: [
      { value: 'circle', label: 'Kreis/Kugel (Radius)' }, { value: 'cone', label: 'Kegel (Länge)' },
      { value: 'line', label: 'Linie (Länge, 5 ft breit)' }, { value: 'square', label: 'Würfel (Kantenlänge)' }] },
    { name: 'sizeFt', label: 'Größe in Fuß', type: 'number', value: 20, step: 5, min: 5 },
  ], okText: 'Auf die Karte tippen …' });
  if (!r) return;
  board.setTool('place-template', { drawing: { type: 'template', shape: r.shape, sizeFt: r.sizeFt || 20, fill: '#3c7dd9', stroke: '#1f4f99' } });
  renderToolbar();
}

function openPanel(which) {
  tab = which;
  document.body.classList.add('panel-open');
  renderTabs();
}

function renderTabs() {
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#sheet').classList.toggle('hidden', tab !== 'sheet');
  $('#abilities').classList.toggle('hidden', tab !== 'abilities');
  $('#inventory').classList.toggle('hidden', tab !== 'inventory');
  $('#party').classList.toggle('hidden', tab !== 'party');
}
$$('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; renderTabs(); }; });

const saveNotes = debounce((v) => conn.act({ type: 'party.update', patch: { notes: v } }), 600);
function renderParty() {
  const el = $('#party');
  const p = state.party;
  quests.update(state.quests || []);
  if (!el.contains(quests.container)) {
    el.replaceChildren(quests.container,
      h('h3', {}, 'Gemeinsame Notizen'),
      h('label.field', {}, h('span', {}, 'Alle sehen und schreiben mit'),
        h('textarea.party-notes', { rows: 10, oninput: (e) => saveNotes(e.target.value), placeholder: 'Namen, Hinweise, offene Fragen …' }, p.notes || '')));
  } else {
    const ta = el.querySelector('textarea.party-notes');
    if (ta && ta !== document.activeElement && ta.value !== (p.notes || '')) ta.value = p.notes || '';
  }
}

function render() {
  const me = state.characters.find((c) => c.seat === seat);
  const mySeat = state.seats.find((s) => s.seat === seat);
  $('#who').textContent = `${me ? me.name : 'Spieler'} · Platz ${seat}${mySeat && mySeat.playerName ? ` (${mySeat.playerName})` : ''}`;
  const sc = state.scenes[0];
  $('#sceneName').textContent = sc ? sc.name : '';
  board.setData(state, sc);

  renderInitiative($('#initiative'), state.initiative.entries, {
    isDM: false, currentId: state.initiative.currentId, state, round: state.initiative.round, effects: state.effects, mySeat: seat,
    onEffectAdd: (e) => conn.act({ type: 'effect.add', ...e }),
    onEffectUpdate: (id, patch) => conn.act({ type: 'effect.update', id, patch }),
    onEffectDelete: (id) => conn.act({ type: 'effect.delete', id }),
  });
  world.update(state);

  if (me && me.hp) {
    if (!sheet) {
      sheet = new Sheet($('#sheet'), {
        kind: 'character',
        showPrivateNotes: true,
        canPickPortrait: false,
        onPatch: (patch) => conn.act({ type: 'character.update', id: me.id, patch }),
        onConditions: (list) => conn.act({ type: 'conditions.set', target: { kind: 'character', id: me.id }, conditions: list }),
      });
    }
    sheet.update(me, state);
    if (!inv) inv = new InventoryEditor($('#inventory'), { onPatch: (patch) => conn.act({ type: 'character.update', id: me.id, patch }), coinNames: () => state.coinNames, coinImage: (key) => coinImage(key, state) });
    inv.update(me);
    if (!abilities) abilities = new AbilitySheet($('#abilities'), { onPatch: (patch) => conn.act({ type: 'character.update', id: me.id, patch }) });
    abilities.update(me);
  }
  renderParty();
}

$('#zoomIn').onclick = () => board.zoomBy(1.25);
$('#zoomOut').onclick = () => board.zoomBy(0.8);
$('#zoomFit').onclick = () => board.fit();
$('#panelToggle').onclick = () => document.body.classList.toggle('panel-open');
if (window.matchMedia('(min-width: 901px)').matches) document.body.classList.add('panel-open');
$('#board').addEventListener('dblclick', () => board.fit());
renderToolbar();
renderTabs();
setupViewToggles('player', board);

// Für automatische Tests (Koordinaten der Karte): window.dnd.board
window.dnd = { board };
