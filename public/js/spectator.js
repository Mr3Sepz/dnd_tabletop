// Zuschauer-Bildschirm: nur die Karte und die Porträtleiste, so wie die Spieler sie sehen
// (Live-Szene, Nebel, nichts Verstecktes). Wie eine Battle Map auf dem Tisch,
// z. B. auf einem Fernseher. Belegt keinen Spielerplatz und kann nichts ändern.

import { $, toast } from './util.js';
import { connect } from './net.js';
import { Board } from './board.js';
import { renderInitiative } from './initiative.js';

let state = null;
let pin = '';
try { pin = sessionStorage.getItem('dnd.spectatorPin') || ''; } catch { /* egal */ }

const board = new Board($('#board'), {
  isDM: false,
  showHpBars: false,
  canDrag: () => false,
  tokenInfo: (t) => ({
    health: t.kind === 'npc' ? t.condition : null,
    conditions: t.conditions || [],
    down: t.condition === 'am Boden' || t.down,
    dead: t.condition === 'tot',
  }),
  canEditDrawing: () => false,
});

let conn = null;
function open() {
  conn = connect({ mode: 'spectator', pin }, {
    onJoined: () => $('#pinBox').classList.add('hidden'),
    onJoinError: (err, res) => {
      conn.socket.close();
      $('#pinBox').classList.remove('hidden');
      $('#pinMsg').textContent = res && res.pinRequired && pin ? 'Die PIN stimmt nicht.' : 'Bitte die Raum-PIN eingeben.';
    },
    onConnection: (ok) => $('#conn').classList.toggle('on', ok),
    onState: (s) => { state = s; render(); },
    onTokenMoved: (m) => board.moveToken(m.id, m.x, m.y),
    onDice: (r) => toast(`${r.by}: ${r.expr} = ${r.total}`),
    onPing: (m) => { window.dnd.lastPing = m; if (board.scene && m.sceneId === board.scene.id) board.showPing(m.x, m.y, m.color, m.name); },
    onStopping: () => toast('Der DM hat das Spiel beendet.', 'error'),
  });
}

$('#pinForm').onsubmit = (e) => {
  e.preventDefault();
  pin = e.target.elements.pin.value.trim();
  try { sessionStorage.setItem('dnd.spectatorPin', pin); } catch { /* egal */ }
  open();
};

function render() {
  const sc = state.scenes[0];
  $('#sceneName').textContent = sc ? sc.name : '';
  board.setData(state, sc);
  renderInitiative($('#initiative'), state.initiative.entries, {
    isDM: false, currentId: state.initiative.currentId, state, round: state.initiative.round, effects: state.effects,
  });
}

$('#zoomIn').onclick = () => board.zoomBy(1.25);
$('#zoomOut').onclick = () => board.zoomBy(0.8);
$('#zoomFit').onclick = () => board.fit();
$('#board').addEventListener('dblclick', () => board.fit());
const fs = $('#fullscreen');
if (!document.fullscreenEnabled) fs.classList.add('hidden');
fs.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); };
window.addEventListener('resize', () => board.fit());
open();
window.dnd = { board };
