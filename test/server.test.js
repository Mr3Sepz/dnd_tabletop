'use strict';
/**
 * Ende-zu-Ende-Tests: echter Server, echte Socket.IO-Clients.
 * Laufen unter Linux und Windows (siehe .github/workflows/ci.yml).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: ioc } = require('socket.io-client');
const { createApp } = require('../server/index');

let inst; let base; let dataDir;
const clients = [];

function connect() {
  const c = ioc(base, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return c;
}
const emit = (c, ev, payload) => new Promise((r) => c.emit(ev, payload, r));
const nextState = (c) => new Promise((r) => c.once('state', r));
const act = async (c, action) => {
  const res = await emit(c, 'action', action);
  return res;
};
async function joinDM() {
  const c = connect();
  const st = nextState(c);
  const res = await emit(c, 'join', { mode: 'dm' });
  assert.equal(res.ok, true, res.error);
  return { c, session: res.session, state: await st };
}
async function joinPlayer(seat, extra = {}) {
  const c = connect();
  const st = nextState(c);
  // Ist der Platz aus einem früheren Test noch belegt, mit dessen Schlüssel wieder einsteigen.
  const claimToken = inst.getState().seats.find((s) => s.seat === seat).claimToken || undefined;
  const res = await emit(c, 'join', { mode: 'player', seat, pin: '4711', playerName: `P${seat}`, claimToken, ...extra });
  if (!res.ok) return { c, res };
  return { c, res, state: await st };
}
const settle = () => new Promise((r) => setTimeout(r, 80));

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-test-'));
  inst = createApp({ port: 0, host: '127.0.0.1', dataDir, openBrowser: false, pin: '4711', autosaveMinutes: 60 });
  const port = await inst.start();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  clients.forEach((c) => c.close());
  await inst.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('DM meldet sich am Host-Rechner ohne Passwort an', async () => {
  const { state } = await joinDM();
  assert.equal(state.scenes.length, 1);
  assert.equal(state.characters.length, 5);
});

test('Spieler braucht die richtige PIN', async () => {
  const c = connect();
  const res = await emit(c, 'join', { mode: 'player', seat: 1, pin: 'falsch' });
  assert.equal(res.ok, false);
  assert.match(res.error, /PIN/);
});

test('Spieler sieht nur aktive Szene, nichts Verstecktes, keine NPC-Werte', async () => {
  const dm = await joinDM();
  const sceneId = dm.state.activeSceneId;
  const other = (await act(dm.c, { type: 'scene.create', name: 'Geheimer Ort' })).result.id;
  const npcId = (await act(dm.c, { type: 'npc.create', name: 'Goblin' })).result.id;
  await act(dm.c, { type: 'npc.update', id: npcId, patch: { hp: { max: 20, cur: 5 }, note: 'Geheim' } });
  await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Goblin', label: 'A', kind: 'npc', refId: npcId } });
  await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Hinterhalt', hidden: true } });
  await act(dm.c, { type: 'token.create', sceneId: other, token: { name: 'Anderswo' } });
  await act(dm.c, { type: 'dm.notes', text: 'Der Graf ist der Drache' });

  const p = await joinPlayer(2);
  assert.equal(p.res.ok, true, p.res.error);
  await settle();
  const st = await new Promise((r) => { p.c.once('state', r); act(dm.c, { type: 'initiative.add', kind: 'npc', refId: npcId }); });

  assert.equal(st.scenes.length, 1);
  assert.equal(st.scenes[0].id, sceneId);
  const names = st.scenes[0].tokens.map((t) => t.name);
  assert.ok(names.includes('Goblin'));
  assert.ok(!names.includes('Hinterhalt'), 'versteckte Figur darf nicht ankommen');
  assert.ok(!('dmNotes' in st));
  assert.ok(!('npcs' in st));
  const goblin = st.scenes[0].tokens.find((t) => t.name === 'Goblin');
  assert.equal(goblin.condition, 'schwer verletzt');
  assert.equal(st.initiative.entries[0].name, 'Goblin');
  assert.equal(st.initiative.entries[0].condition, 'schwer verletzt');
  assert.ok(!JSON.stringify(st).includes('Geheim'), 'keine NPC-Notiz, keine fremde Szene');
  // eigener Charakter vollständig, fremde nur Name/Bild
  const mine = st.characters.find((c) => c.seat === 2);
  const foreign = st.characters.find((c) => c.seat === 3);
  assert.ok(mine.hp && mine.slots);
  assert.equal(foreign.hp, undefined);
});

test('Private Spielernotizen sieht niemand außer dem Spieler', async () => {
  const dm = await joinDM();
  const p = await joinPlayer(3);
  assert.equal(p.res.ok, true, p.res.error);
  const charId = p.state.characters.find((c) => c.seat === 3).id;
  const dmState = nextState(dm.c);
  const res = await act(p.c, { type: 'character.update', id: charId, patch: { privateNotes: 'Ich traue dem Grafen nicht', inventory: 'Seil' } });
  assert.equal(res.ok, true, res.error);
  const ds = await dmState;
  const c = ds.characters.find((x) => x.id === charId);
  assert.equal(c.privateNotes, undefined);
  assert.equal(c.inventory, 'Seil');
  assert.ok(!JSON.stringify(ds).includes('Grafen nicht'));
  // DM darf private Notizen auch nicht schreiben
  await act(dm.c, { type: 'character.update', id: charId, patch: { privateNotes: 'überschrieben' } });
  assert.equal(inst.getState().characters.find((x) => x.id === charId).privateNotes, 'Ich traue dem Grafen nicht');
});

test('Spieler bewegt nur eigene Figuren, DM alle', async () => {
  const dm = await joinDM();
  const sceneId = dm.state.activeSceneId;
  const own = (await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Held', ownerSeat: 4, kind: 'player' } })).result.id;
  const foreign = (await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Fremd', ownerSeat: 5 } })).result.id;
  const p = await joinPlayer(4);
  assert.equal(p.res.ok, true, p.res.error);
  assert.equal((await act(p.c, { type: 'token.move', sceneId, id: own, x: 100, y: 50, final: true })).ok, true);
  assert.equal((await act(p.c, { type: 'token.move', sceneId, id: foreign, x: 1, y: 1 })).ok, false);
  assert.equal((await act(p.c, { type: 'token.create', sceneId, token: {} })).ok, false, 'Spieler setzen keine Figuren');
  assert.equal((await act(dm.c, { type: 'token.move', sceneId, id: foreign, x: 9, y: 9 })).ok, true);
  const t = inst.getState().scenes[0].tokens.find((x) => x.id === own);
  assert.deepEqual([t.x, t.y], [100, 50]);
});

test('Belegter Platz: abgelehnt, mit Schlüssel wieder verbinden, DM gibt frei', async () => {
  const first = await joinPlayer(5);
  assert.equal(first.res.ok, true, first.res.error);
  const intruder = await joinPlayer(5, { claimToken: undefined });
  assert.equal(intruder.res.ok, false);
  // Wiederverbinden mit dem gemerkten Schlüssel (V9), ohne PIN
  const back = connect();
  const again = await emit(back, 'join', { mode: 'player', seat: 5, claimToken: first.res.claimToken });
  assert.equal(again.ok, true, again.error);
  // DM gibt Platz frei (V10)
  const dm = await joinDM();
  const kicked = new Promise((r) => back.once('kicked', r));
  await act(dm.c, { type: 'seat.release', seat: 5 });
  await kicked;
  const now = await joinPlayer(5, { claimToken: undefined });
  assert.equal(now.res.ok, true, now.res.error);
});

test('Export und Import stellen den Stand exakt wieder her (L3, L4)', async () => {
  const dm = await joinDM();
  // Bild hochladen
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = await fetch(`${base}/api/assets?name=Karte&w=1&h=1`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-session': dm.session }, body: png });
  assert.equal(up.status, 200);
  const asset = await up.json();
  const sceneId = inst.getState().activeSceneId;
  await act(dm.c, { type: 'scene.update', id: sceneId, patch: { background: { assetId: asset.id }, night: true, grid: { size: 55 } } });
  await settle();
  const before = JSON.parse(JSON.stringify(inst.getState().scenes));

  const res = await fetch(`${base}/api/export?session=${dm.session}`);
  assert.equal(res.status, 200);
  const zip = Buffer.from(await res.arrayBuffer());

  // Stand verändern, dann Import
  await act(dm.c, { type: 'scene.create', name: 'Wird verworfen' });
  await act(dm.c, { type: 'scene.update', id: sceneId, patch: { night: false } });
  const imp = await fetch(`${base}/api/import`, { method: 'POST', headers: { 'content-type': 'application/zip', 'x-session': dm.session }, body: zip });
  assert.equal(imp.status, 200, await imp.text());
  assert.deepEqual(inst.getState().scenes, before);
  const img = await fetch(`${base}/assets/${asset.file}`);
  assert.equal(img.status, 200);

  // Spieler ohne DM-Session dürfen nicht exportieren
  assert.equal((await fetch(`${base}/api/export`)).status, 403);
});

test('Autosave-Datei wird geschrieben und wieder geladen (L1, L2)', async () => {
  const dm = await joinDM();
  await act(dm.c, { type: 'dm.notes', text: 'Merken!' });
  inst.saveNow();
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  assert.equal(saved.dmNotes, 'Merken!');
  const { normalizeState } = require('../server/state');
  assert.equal(normalizeState(saved).dmNotes, 'Merken!');
});

test('Initiative-Leiste: hinzufügen, umsortieren, weiterschalten (N7)', async () => {
  const dm = await joinDM();
  const s = inst.getState();
  await act(dm.c, { type: 'initiative.clear' });
  const n = (await act(dm.c, { type: 'npc.create', name: 'Ork' })).result.id;
  await act(dm.c, { type: 'initiative.add', kind: 'npc', refId: n });
  await act(dm.c, { type: 'initiative.add', kind: 'character', refId: s.characters[0].id });
  const ids = inst.getState().initiative.entries.map((e) => e.id);
  assert.equal(inst.getState().initiative.currentId, ids[0]);
  assert.equal((await act(dm.c, { type: 'initiative.reorder', ids: [...ids].reverse() })).ok, true);
  let ini = inst.getState().initiative;
  assert.equal(ini.entries[0].kind, 'character');
  assert.equal(ini.currentId, ids[0], 'die Markierung bleibt beim Ork, auch wenn er nach hinten rutscht');
  await act(dm.c, { type: 'initiative.next' });
  ini = inst.getState().initiative;
  assert.equal(ini.currentId, ini.entries[0].id, 'nach dem letzten geht es wieder vorne los');
});

// ---------------------------------------------------------------- Stufe 0

test('Leck geschlossen: versteckte Gegner tauchen nicht in der Porträtleiste auf (P1)', async () => {
  const dm = await joinDM();
  const sceneId = inst.getState().activeSceneId;
  await act(dm.c, { type: 'initiative.clear' });
  const n = (await act(dm.c, { type: 'npc.create', name: 'Lauernder Goblin' })).result.id;
  const t = (await act(dm.c, { type: 'token.create', sceneId, token: { kind: 'npc', refId: n, name: 'Goblin', hidden: true } })).result.id;
  await act(dm.c, { type: 'initiative.add', kind: 'npc', refId: n, value: 15 });
  const p = await joinPlayer(1, { claimToken: undefined });
  const view = () => require('../server/state').viewForPlayer(inst.getState(), 1);
  assert.equal(view().initiative.entries.some((e) => e.name === 'Lauernder Goblin'), false, 'versteckt = nicht in der Leiste');
  await act(dm.c, { type: 'token.update', sceneId, id: t, patch: { hidden: false } });
  assert.equal(view().initiative.entries.some((e) => e.name === 'Lauernder Goblin'), true, 'aufgedeckt = in der Leiste');
  const entry = inst.getState().initiative.entries.find((e) => e.refId === n);
  await act(dm.c, { type: 'initiative.update', id: entry.id, patch: { visibility: 'hide' } });
  assert.equal(view().initiative.entries.some((e) => e.name === 'Lauernder Goblin'), false, 'DM kann Eintrag fest verbergen');
  p.c.close();
});

test('Bei 0 HP: Spieler sehen „am Boden“, erst „tot“ wenn der DM es sagt (P5)', async () => {
  const dm = await joinDM();
  const sceneId = inst.getState().activeSceneId;
  const n = (await act(dm.c, { type: 'npc.create', name: 'Gefangener' })).result.id;
  await act(dm.c, { type: 'npc.update', id: n, patch: { hp: { max: 7, cur: 7 } } });
  await act(dm.c, { type: 'token.create', sceneId, token: { kind: 'npc', refId: n, name: 'Gefangener' } });
  const res = await act(dm.c, { type: 'hp.apply', targets: [{ kind: 'npc', id: n }], amount: 9, mode: 'damage' });
  assert.deepEqual(res.result.downed.map((d) => d.id), [n], 'DM bekommt Rückmeldung: wer ist auf 0');
  const { viewForPlayer } = require('../server/state');
  const tok = () => viewForPlayer(inst.getState(), 1).scenes[0].tokens.find((t) => t.refId === n);
  assert.equal(tok().condition, 'am Boden');
  await act(dm.c, { type: 'npc.update', id: n, patch: { dead: true } });
  assert.equal(tok().condition, 'tot');
  await act(dm.c, { type: 'hp.apply', targets: [{ kind: 'npc', id: n }], amount: 3, mode: 'heal' });
  assert.equal(tok().condition, 'schwer verletzt', 'Heilung hebt „tot“ wieder auf');
});

// ---------------------------------------------------------------- Stufe 1

test('Zustände: DM an NPCs, Spieler nur am eigenen Charakter; Spieler sehen sie an Figuren (P4)', async () => {
  const dm = await joinDM();
  const sceneId = inst.getState().activeSceneId;
  const n = (await act(dm.c, { type: 'npc.create', name: 'Wolf' })).result.id;
  await act(dm.c, { type: 'token.create', sceneId, token: { kind: 'npc', refId: n, name: 'Wolf' } });
  assert.equal((await act(dm.c, { type: 'conditions.set', target: { kind: 'npc', id: n }, conditions: [{ key: 'unconscious' }, { key: 'custom', label: 'Schläft (Sleep)', color: '#3a3a6a' }] })).ok, true);
  const p = await joinPlayer(2);
  const me = inst.getState().characters.find((c) => c.seat === 2);
  assert.equal((await act(p.c, { type: 'conditions.set', target: { kind: 'character', id: me.id }, conditions: [{ key: 'prone' }] })).ok, true);
  assert.equal((await act(p.c, { type: 'conditions.set', target: { kind: 'npc', id: n }, conditions: [] })).ok, false);
  const { viewForPlayer } = require('../server/state');
  const wolf = viewForPlayer(inst.getState(), 2).scenes[0].tokens.find((t) => t.refId === n);
  assert.deepEqual(wolf.conditions.map((c) => c.label), ['Bewusstlos', 'Schläft (Sleep)']);
  assert.equal(inst.getState().characters.find((c) => c.seat === 2).conditions[0].label, 'Liegend');
  // Todesrettungswürfe
  await act(p.c, { type: 'character.update', id: me.id, patch: { deathSaves: { success: 2, fail: 1 } } });
  assert.deepEqual(inst.getState().characters.find((c) => c.seat === 2).deathSaves, { success: 2, fail: 1 });
  p.c.close();
});

test('Initiativwerte sortieren, Gruppen-Eintrag „Goblins“ (P6)', async () => {
  const dm = await joinDM();
  const st = inst.getState();
  await act(dm.c, { type: 'initiative.clear' });
  const g1 = (await act(dm.c, { type: 'npc.create', name: 'G1' })).result.id;
  const g2 = (await act(dm.c, { type: 'npc.create', name: 'G2' })).result.id;
  await act(dm.c, { type: 'initiative.add', kind: 'character', refId: st.characters[0].id, value: 12 });
  await act(dm.c, { type: 'initiative.add', kind: 'character', refId: st.characters[1].id, value: 20 });
  await act(dm.c, { type: 'initiative.add', kind: 'npc', refId: g1 });
  const grp = (await act(dm.c, { type: 'initiative.addGroup', name: 'Goblins', refIds: [g1, g2], value: 15 })).result.id;
  const ini = inst.getState().initiative;
  assert.equal(ini.entries.filter((e) => e.kind === 'npc').length, 0, 'einzelner Eintrag wandert in die Gruppe');
  await act(dm.c, { type: 'initiative.sort', startTop: true });
  const order = inst.getState().initiative.entries.map((e) => e.value);
  assert.deepEqual(order, [20, 15, 12]);
  assert.equal(inst.getState().initiative.entries[1].id, grp);
  assert.equal(inst.getState().initiative.currentId, inst.getState().initiative.entries[0].id);
});

test('Schaden für mehrere auf einmal, temporäre HP zuerst (P7)', async () => {
  const dm = await joinDM();
  const [a, b] = inst.getState().characters;
  await act(dm.c, { type: 'character.update', id: a.id, patch: { hp: { max: 20, cur: 20, temp: 5 } } });
  await act(dm.c, { type: 'character.update', id: b.id, patch: { hp: { max: 20, cur: 20, temp: 0 } } });
  await act(dm.c, { type: 'hp.apply', targets: [{ kind: 'character', id: a.id }, { kind: 'character', id: b.id }], amount: 8, mode: 'damage' });
  const s = inst.getState();
  assert.deepEqual(s.characters[0].hp, { max: 20, cur: 17, temp: 0 });
  assert.deepEqual(s.characters[1].hp, { max: 20, cur: 12, temp: 0 });
});

test('Mehrfach setzen: 5 Goblins mit eigenen HP und Kennungen (P8)', async () => {
  const dm = await joinDM();
  const sceneId = inst.getState().activeSceneId;
  const base = (await act(dm.c, { type: 'npc.create', name: 'Goblin' })).result.id;
  await act(dm.c, { type: 'npc.update', id: base, patch: { hp: { max: 7, cur: 7 } } });
  const res = await act(dm.c, { type: 'npc.spawn', sceneId, npcId: base, labels: ['A', 'B', 'C', 'D', 'E'], x: 35, y: 35, hidden: true });
  assert.equal(res.result.created.length, 5);
  const s = inst.getState();
  const names = res.result.created.map((c) => s.npcs.find((n) => n.id === c.npcId).name);
  assert.deepEqual(names, ['Goblin A', 'Goblin B', 'Goblin C', 'Goblin D', 'Goblin E']);
  assert.equal(new Set(res.result.created.map((c) => c.npcId)).size, 5, 'jeder Goblin hat eigene HP');
  const toks = s.scenes.find((x) => x.id === sceneId).tokens.filter((t) => res.result.created.some((c) => c.tokenId === t.id));
  assert.ok(toks.every((t) => t.hidden));
  assert.deepEqual(toks.map((t) => t.label), ['A', 'B', 'C', 'D', 'E']);
  // Zweite Welle: Namen wachsen nicht ("Goblin A 1")
  const again = await act(dm.c, { type: 'npc.spawn', sceneId, npcId: base, labels: ['F'], x: 0, y: 0 });
  assert.equal(inst.getState().npcs.find((n) => n.id === again.result.created[0].npcId).name, 'Goblin F');
});

// ---------------------------------------------------------------- Stufe 2

test('Fog of War: Figuren im Nebel kommen beim Spieler nicht an, eigene schon (P2)', async () => {
  const dm = await joinDM();
  const sceneId = (await act(dm.c, { type: 'scene.create', name: 'Höhle' })).result.id;
  await act(dm.c, { type: 'scene.activate', id: sceneId });
  const inFog = (await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Bugbear', x: 500, y: 500 } })).result.id;
  const mine = (await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Held', ownerSeat: 1, x: 900, y: 900 } })).result.id;
  await act(dm.c, { type: 'fog.reset', sceneId, mode: 'hideAll' });
  const { viewForPlayer } = require('../server/state');
  const ids = () => viewForPlayer(inst.getState(), 1).scenes[0].tokens.map((t) => t.id);
  assert.deepEqual(ids(), [mine]);
  await act(dm.c, { type: 'fog.add', sceneId, shape: { op: 'reveal', type: 'rect', x: 400, y: 400, w: 200, h: 200 } });
  assert.ok(ids().includes(inFog));
  await act(dm.c, { type: 'fog.add', sceneId, shape: { op: 'hide', type: 'stroke', points: [450, 450, 550, 550], r: 30 } });
  assert.ok(!ids().includes(inFog), 'Pinsel verdeckt wieder');
  await act(dm.c, { type: 'fog.undo', sceneId });
  assert.ok(ids().includes(inFog));
  assert.equal(viewForPlayer(inst.getState(), 1).scenes[0].fog.enabled, true);
});

test('Szene pro Spieler: getrennte Gruppen, „Live schalten“ führt zusammen (P3)', async () => {
  const dm = await joinDM();
  const main = inst.getState().activeSceneId;
  const side = (await act(dm.c, { type: 'scene.create', name: 'Kamin' })).result.id;
  await act(dm.c, { type: 'seat.setScene', seat: 2, sceneId: side });
  const { viewForPlayer } = require('../server/state');
  assert.equal(viewForPlayer(inst.getState(), 2).scenes[0].id, side);
  assert.equal(viewForPlayer(inst.getState(), 3).scenes[0].id, main);
  const tok = (await act(dm.c, { type: 'token.create', sceneId: side, token: { name: 'Kletterer', ownerSeat: 2 } })).result.id;
  const p = await joinPlayer(2);
  assert.equal((await act(p.c, { type: 'token.move', sceneId: side, id: tok, x: 10, y: 10 })).ok, true);
  await act(dm.c, { type: 'scene.activate', id: main });
  assert.equal(viewForPlayer(inst.getState(), 2).scenes[0].id, main);
  p.c.close();
});

test('Sicht pro Spieler: nur wer den Wurf geschafft hat, sieht den Goblin (P1/Vorschlag 9)', async () => {
  const dm = await joinDM();
  const sceneId = (await act(dm.c, { type: 'scene.create', name: 'Wald' })).result.id;
  await act(dm.c, { type: 'scene.activate', id: sceneId });
  const t = (await act(dm.c, { type: 'token.create', sceneId, token: { name: 'Späher', visibleTo: [1, 3] } })).result.id;
  const { viewForPlayer } = require('../server/state');
  const sees = (seat) => viewForPlayer(inst.getState(), seat).scenes[0].tokens.some((x) => x.id === t);
  assert.deepEqual([1, 2, 3].map(sees), [true, false, true]);
  await act(dm.c, { type: 'token.update', sceneId, id: t, patch: { visibleTo: null } });
  assert.deepEqual([1, 2, 3].map(sees), [true, true, true]);
});

test('Zeichnungen: Spieler dürfen nur Schablonen legen, versteckte Zeichnungen bleiben geheim (P9)', async () => {
  const dm = await joinDM();
  const sceneId = inst.getState().activeSceneId;
  const secret = (await act(dm.c, { type: 'drawing.create', sceneId, drawing: { type: 'rect', x: 10, y: 10, w: 50, h: 50, hidden: true, label: 'Falltür' } })).result.id;
  const wagon = (await act(dm.c, { type: 'drawing.create', sceneId, drawing: { type: 'rect', x: 100, y: 100, w: 140, h: 70, rotation: 30, label: 'Wagen' } })).result.id;
  const p = await joinPlayer(3);
  assert.equal((await act(p.c, { type: 'drawing.create', sceneId, drawing: { type: 'rect' } })).ok, false);
  const tpl = await act(p.c, { type: 'drawing.create', sceneId, drawing: { type: 'template', shape: 'cone', sizeFt: 15, x: 0, y: 0 } });
  assert.equal(tpl.ok, true);
  assert.equal((await act(p.c, { type: 'drawing.delete', sceneId, id: wagon })).ok, false);
  const { viewForPlayer } = require('../server/state');
  const ids = viewForPlayer(inst.getState(), 3).scenes[0].drawings.map((d) => d.id);
  assert.ok(ids.includes(wagon) && ids.includes(tpl.result.id) && !ids.includes(secret));
  assert.equal(inst.getState().scenes.find((x) => x.id === sceneId).drawings.find((d) => d.id === wagon).rotation, 30);
  p.c.close();
});

// ---------------------------------------------------------------- Stufe 3

test('Gruppenwerte: alle sehen sie, XP und Datum ändert nur der DM (P12)', async () => {
  const dm = await joinDM();
  const p = await joinPlayer(4);
  assert.equal((await act(dm.c, { type: 'party.update', patch: { xp: 450, date: 'Tag 11, 14 Uhr' } })).ok, true);
  assert.equal((await act(p.c, { type: 'party.update', patch: { notes: 'Quest: Gundren finden', gold: '23 GM' } })).ok, true);
  assert.equal((await act(p.c, { type: 'party.update', patch: { xp: 99999 } })).ok, false);
  const { viewForPlayer } = require('../server/state');
  assert.deepEqual(viewForPlayer(inst.getState(), 4).party, { notes: 'Quest: Gundren finden', xp: 450, gold: '23 GM', date: 'Tag 11, 14 Uhr' });
  p.c.close();
});

test('Würfel: offene Würfe sehen alle, verdeckte DM-Würfe nur der DM (X1, X2)', async () => {
  const dm = await joinDM();
  const p = await joinPlayer(5);
  const seen = [];
  p.c.on('dice', (r) => seen.push(r));
  const open = await act(p.c, { type: 'dice.roll', expr: '1d20+5' });
  assert.ok(open.result.roll.total >= 6 && open.result.roll.total <= 25);
  const hidden = await act(dm.c, { type: 'dice.roll', expr: '2d20kh1', secret: true });
  assert.equal(hidden.ok, true);
  assert.equal((await act(p.c, { type: 'dice.roll', expr: 'd20+' })).ok, false, 'Tippfehler gibt eine Meldung statt Absturz');
  await settle();
  const { viewForPlayer, viewForDM } = require('../server/state');
  const pl = viewForPlayer(inst.getState(), 5).diceLog.map((d) => d.id);
  assert.ok(pl.includes(open.result.roll.id) && !pl.includes(hidden.result.roll.id));
  assert.ok(viewForDM(inst.getState()).diceLog.some((d) => d.id === hidden.result.roll.id));
  assert.ok(seen.some((r) => r.id === open.result.roll.id) && !seen.some((r) => r.id === hidden.result.roll.id));
  p.c.close();
});

// ---------------------------------------------------------------- Feedback des DM (21.11.)

test('Inventar pro Charakter: Münzen und Gegenstände ändern Spieler selbst und der DM, sonst niemand', async () => {
  const dm = await joinDM();
  const p1 = await joinPlayer(1);
  const p2 = await joinPlayer(2);
  const mine = inst.getState().characters.find((c) => c.seat === 1);
  assert.equal((await act(p1.c, { type: 'character.update', id: mine.id, patch: { coins: { gp: 23, sp: 4 }, inventory: 'Seil' } })).ok, true);
  assert.equal((await act(dm.c, { type: 'character.update', id: mine.id, patch: { coins: { pp: 1 } } })).ok, true, 'DM darf etwas eintragen');
  assert.equal((await act(p2.c, { type: 'character.update', id: mine.id, patch: { coins: { gp: 0 } } })).ok, false, 'fremdes Inventar ist tabu');
  const c = inst.getState().characters.find((x) => x.seat === 1);
  assert.deepEqual(c.coins, { pp: 1, gp: 23, sp: 4, cp: 0 });
  assert.equal(c.inventory, 'Seil');
  // Fremde Spieler sehen weder Münzen noch Gegenstände
  const { viewForPlayer } = require('../server/state');
  const seenBy2 = viewForPlayer(inst.getState(), 2).characters.find((x) => x.seat === 1);
  assert.equal(seenBy2.coins, undefined);
  assert.equal(seenBy2.inventory, undefined);
  // Negative oder kaputte Werte werden abgefangen
  await act(p1.c, { type: 'character.update', id: mine.id, patch: { coins: { cp: -5, gp: 'viel' } } });
  assert.deepEqual(inst.getState().characters.find((x) => x.seat === 1).coins, { pp: 1, gp: 0, sp: 4, cp: 0 });
  p1.c.close(); p2.c.close();
});

test('Bogen anpassen: Zauberplätze und Zähler ausblendbar, Spieler dürfen das am eigenen Bogen', async () => {
  const p3 = await joinPlayer(3);
  const me = inst.getState().characters.find((c) => c.seat === 3);
  assert.deepEqual(me.sheetPrefs, { slots: true, counters: true });
  assert.equal((await act(p3.c, { type: 'character.update', id: me.id, patch: { sheetPrefs: { slots: false } } })).ok, true);
  assert.deepEqual(inst.getState().characters.find((c) => c.seat === 3).sheetPrefs, { slots: false, counters: true });
  p3.c.close();
});

test('Zustand „Blutend“ gibt es', async () => {
  const dm = await joinDM();
  const n = (await act(dm.c, { type: 'npc.create', name: 'Ork' })).result.id;
  await act(dm.c, { type: 'conditions.set', target: { kind: 'npc', id: n }, conditions: [{ key: 'bleeding' }] });
  assert.equal(inst.getState().npcs.find((x) => x.id === n).conditions[0].label, 'Blutend');
});

test('Infotexte: jeder Zustand aus dem Katalog hat eine Erklärung, Quelle ist SRD 5.1', () => {
  const help = require('../shared/rules-help.json');
  const cat = require('../shared/conditions.json');
  for (const c of cat.conditions) assert.ok(help.conditions[c.key], `Erklärung fehlt: ${c.key}`);
  assert.match(help.attribution, /System Reference Document 5\.1/);
  assert.match(help.attribution, /creativecommons\.org\/licenses\/by\/4\.0/);
});
