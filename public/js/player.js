// Spieleransicht (A2): aktive Szene, eigene Figuren bewegen, eigener
// Charakterbogen mit Inventar und privatem Notizbuch, Porträtleiste.

import { $ } from './util.js';
import { connect, storedSeat } from './net.js';
import { Board } from './board.js';
import { Sheet } from './sheet.js';
import { renderInitiative } from './initiative.js';

const params = new URLSearchParams(location.search);
const seat = Number(params.get('seat')) || storedSeat()?.seat;
if (!seat) location.href = '/';

let join = {};
try { join = JSON.parse(sessionStorage.getItem('dnd.join') || '{}'); } catch { /* egal */ }
if (join.seat !== seat) join = {};

let state = null;
let sheet = null;

const board = new Board($('#board'), {
  showHpBars: false,
  canDrag: (t) => t.ownerSeat === seat,
  onMove: (t, x, y, final) => conn.act({ type: 'token.move', sceneId: state.activeSceneId, id: t.id, x, y, final }),
  onTokenClick: (t) => { if (t.ownerSeat === seat) document.body.classList.add('panel-open'); },
  tokenInfo: (t) => (t.kind === 'npc' && t.condition ? { condition: t.condition, defeated: t.condition === 'besiegt' } : {}),
});

const conn = connect({ mode: 'player', seat, pin: join.pin, playerName: join.playerName }, {
  onJoined: () => { sessionStorage.removeItem('dnd.join'); },
  onJoinError: (err) => gone('Beitritt nicht möglich', err),
  onKicked: (k) => gone('Platz freigegeben', k.reason),
  onConnection: (ok) => $('#conn').classList.toggle('on', ok),
  onState: (s) => { state = s; render(); },
  onTokenMoved: (m) => board.moveToken(m.id, m.x, m.y),
});

function gone(title, msg) {
  conn.socket.close();
  $('#goneTitle').textContent = title;
  $('#goneMsg').textContent = msg;
  $('#gone').classList.remove('hidden');
}

function render() {
  const me = state.characters.find((c) => c.seat === seat);
  const mySeat = state.seats.find((s) => s.seat === seat);
  $('#who').textContent = `${me ? me.name : 'Spieler'} · Platz ${seat}${mySeat && mySeat.playerName ? ` (${mySeat.playerName})` : ''}`;
  const sc = state.scenes[0];
  $('#sceneName').textContent = sc ? sc.name : '';
  board.setData(state, sc);

  renderInitiative($('#initiative'), state.initiative.entries, { isDM: false, current: state.initiative.current, state });

  if (me && me.hp) {
    if (!sheet) {
      sheet = new Sheet($('#sheet'), {
        kind: 'character',
        showInventory: true,
        showPrivateNotes: true,
        canPickPortrait: false,
        onPatch: (patch) => conn.act({ type: 'character.update', id: me.id, patch }),
      });
    }
    sheet.update(me, state);
  }
}

$('#zoomIn').onclick = () => board.zoomBy(1.25);
$('#zoomOut').onclick = () => board.zoomBy(0.8);
$('#zoomFit').onclick = () => board.fit();
$('#panelToggle').onclick = () => document.body.classList.toggle('panel-open');
if (window.matchMedia('(min-width: 901px)').matches) document.body.classList.add('panel-open');

// Kleines Detail: Doppeltippen auf leere Fläche passt die Karte ein.
$('#board').addEventListener('dblclick', () => board.fit());
