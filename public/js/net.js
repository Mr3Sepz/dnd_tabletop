// Verbindung zum Server: anmelden, Aktionen senden, Zustand empfangen.
// Socket.IO verbindet sich nach Abbrüchen von selbst neu (V9); wir melden uns
// danach automatisch mit dem gemerkten Schlüssel wieder an.

/* global io */
import { toast } from './util.js';

const KEY_DM = 'dnd.dmSession';
const KEY_SEAT = 'dnd.seat';

export function storedSeat() {
  try { return JSON.parse(localStorage.getItem(KEY_SEAT) || 'null'); } catch { return null; }
}
export function storeSeat(v) {
  try { if (v) localStorage.setItem(KEY_SEAT, JSON.stringify(v)); else localStorage.removeItem(KEY_SEAT); } catch { /* privat */ }
}
export function storedDmSession() {
  try { return localStorage.getItem(KEY_DM); } catch { return null; }
}
function storeDmSession(v) {
  try { if (v) localStorage.setItem(KEY_DM, v); else localStorage.removeItem(KEY_DM); } catch { /* privat */ }
}

/**
 * Baut die Verbindung auf.
 * joinPayload: { mode: 'dm', password? } oder { mode: 'player', seat, pin, playerName, claimToken? }
 */
export function connect(joinPayload, handlers) {
  const socket = io({ transports: ['websocket', 'polling'] });
  const conn = { socket, session: null, seat: null, joined: false };

  const doJoin = () => new Promise((resolve) => {
    const payload = { ...joinPayload };
    if (payload.mode === 'dm') payload.session = storedDmSession();
    else {
      const s = storedSeat();
      if (s && s.seat === payload.seat && s.claimToken) payload.claimToken = s.claimToken;
    }
    socket.emit('join', payload, (res) => {
      if (!res || !res.ok) {
        // Gemerkter Schlüssel ungültig? Einmal ohne versuchen.
        if (payload.mode === 'dm' && payload.session) { storeDmSession(null); return resolve(doJoin()); }
        handlers.onJoinError?.(res ? res.error : 'Keine Antwort');
        return resolve(false);
      }
      conn.joined = true;
      if (res.role === 'dm') { conn.session = res.session; storeDmSession(res.session); }
      else { conn.seat = res.seat; storeSeat({ seat: res.seat, claimToken: res.claimToken }); }
      handlers.onJoined?.(res);
      resolve(true);
    });
  });

  socket.on('connect', () => { conn.joined = false; handlers.onConnection?.(true); doJoin(); });
  socket.on('disconnect', () => { conn.joined = false; handlers.onConnection?.(false); });
  socket.on('state', (s) => handlers.onState?.(s));
  socket.on('token:moved', (m) => handlers.onTokenMoved?.(m));
  socket.on('info', (i) => handlers.onInfo?.(i));
  socket.on('saved', (i) => handlers.onSaved?.(i));
  socket.on('kicked', (k) => {
    storeSeat(null);
    handlers.onKicked?.(k);
  });

  /** Aktion senden; zeigt Fehler als Hinweis an. */
  conn.act = (action) => new Promise((resolve) => {
    socket.emit('action', action, (res) => {
      if (!res || !res.ok) { toast(res ? res.error : 'Keine Verbindung', 'error'); resolve(null); return; }
      resolve(res.result || {});
    });
  });
  conn.request = (ev, payload) => new Promise((resolve) => {
    if (payload === undefined) socket.emit(ev, resolve); else socket.emit(ev, payload, resolve);
  });
  return conn;
}
