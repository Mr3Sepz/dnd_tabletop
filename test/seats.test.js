'use strict';
// Eigene Datei, weil die Platzanzahl pro Prozess gilt (node --test startet je Datei einen Prozess).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server/index');

test('Anzahl der Plätze ist einstellbar (Vorschlag 13)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-seats-'));
  const inst = createApp({ port: 0, host: '127.0.0.1', dataDir, openBrowser: false, seats: 7 });
  const port = await inst.start();
  const info = await fetch(`http://127.0.0.1:${port}/api/public-info`).then((r) => r.json());
  assert.equal(info.seats.length, 7);
  assert.equal(inst.getState().characters.length, 7);
  await inst.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('DM ändert die Platzanzahl im laufenden Spiel, belegte Plätze bleiben', async () => {
  const { io: ioc } = require('socket.io-client');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-seats-'));
  const inst = createApp({ port: 0, host: '127.0.0.1', dataDir, openBrowser: false });
  const port = await inst.start();
  const base = `http://127.0.0.1:${port}`;
  const emit = (c, ev, p) => new Promise((r) => c.emit(ev, p, r));
  const dm = ioc(base, { transports: ['websocket'], forceNew: true });
  await emit(dm, 'join', { mode: 'dm' });
  const act = (a) => emit(dm, 'action', a);
  assert.equal(inst.getState().seats.length, 5, 'Standard bleibt 5');
  assert.equal((await act({ type: 'settings.update', patch: { seatCount: 12 } })).ok, true);
  assert.equal(inst.getState().seats.length, 12);
  assert.equal(inst.getState().characters.length, 12);
  // Spieler auf Platz 11, dann verkleinern: abgelehnt
  const p = ioc(base, { transports: ['websocket'], forceNew: true });
  assert.equal((await emit(p, 'join', { mode: 'player', seat: 11 })).ok, true);
  const shrink = await act({ type: 'settings.update', patch: { seatCount: 6 } });
  assert.equal(shrink.ok, false);
  assert.match(shrink.error, /11/);
  await act({ type: 'seat.release', seat: 11 });
  assert.equal((await act({ type: 'settings.update', patch: { seatCount: 6 } })).ok, true);
  assert.equal(inst.getState().seats.length, 6);
  // Spielstand merkt sich die Anzahl
  inst.saveNow();
  const { normalizeState, configureSeats } = require('../server/state');
  configureSeats(5);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(normalizeState(saved).seats.length, 6);
  assert.equal((await act({ type: 'settings.update', patch: { seatCount: 99 } })).result.seatCount, 20, 'höchstens 20');
  dm.close(); p.close();
  await inst.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
