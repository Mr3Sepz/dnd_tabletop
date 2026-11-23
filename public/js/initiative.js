// Porträtleiste am oberen Rand = Initiative-Tracker (N7).
// DM: Initiativwert eintragen, sortieren, ziehen oder per Pfeil umstellen, weiterschalten,
// Sichtbarkeit pro Eintrag (automatisch / immer / nie). Spieler sehen nur, was sie sehen
// dürfen (der Server filtert), bei Gegnern nur den groben Zustand (N8).

import { h, assetUrl, initials, HEALTH_COLORS, dialog } from './util.js';
import { info, helpLines } from './help.js';
import { term } from './i18n.js';

const VIS = { auto: '👁 automatisch', show: '👁 immer zeigen', hide: '🚫 verborgen' };

async function chooseVisibility(e, onVisibility) {
  const r = await dialog({
    title: `Wer sieht „${e.name}“ in der Leiste?`,
    body: helpLines('visibility'),
    fields: [{ name: 'v', label: 'Sichtbarkeit für Spieler', type: 'select', value: e.visibility || 'auto', options: [
      { value: 'auto', label: 'Automatisch – sobald eine Figur davon sichtbar ist' },
      { value: 'show', label: 'Immer zeigen – auch ohne Figur auf der Karte' },
      { value: 'hide', label: 'Verbergen – nur ich sehe den Eintrag' }] }],
    okText: 'Übernehmen',
  });
  if (r) onVisibility(e.id, r.v);
}

const remaining = (e, round) => e.endRound - round + 1;

async function effectDialog(opts, e) {
  const fields = [
    { name: 'name', label: 'Effekt', value: e ? e.name : '', placeholder: 'z. B. Segen auf Borin' },
    { name: 'rounds', label: e ? 'Noch Runden' : 'Dauer in Runden (1 Minute = 10)', type: 'number', min: 0, value: e ? Math.max(0, remaining(e, opts.round)) : 10 },
  ];
  if (opts.isDM) fields.push({ name: 'hidden', label: 'Nur ich sehe ihn (Spieler nicht)', type: 'checkbox', value: e ? !!e.hidden : false });
  const r = await dialog({
    title: e ? `Effekt: ${e.name}` : 'Neuer Effekttimer', body: helpLines('effects').slice(0, 2), fields,
    buttons: e ? [{ label: 'Entfernen', value: 'delete', cls: 'danger' }, { label: 'Speichern', value: 'save' }] : [{ label: 'Starten', value: 'save' }],
  });
  if (!r) return;
  if (r._button === 'delete') return opts.onEffectDelete(e.id);
  if (e) opts.onEffectUpdate(e.id, { name: r.name, remaining: r.rounds ?? 0, ...(opts.isDM ? { hidden: r.hidden } : {}) });
  else opts.onEffectAdd({ name: r.name, rounds: r.rounds || 1, hidden: !!r.hidden });
}

/** Rundenzähler (links) und Effekttimer. */
function roundBox(opts) {
  const round = opts.round || 1;
  const box = h('div.round-box', {},
    h('div.round', { title: 'Kampfrunde' },
      h('small', {}, term('round'), info('round')),
      h('div.round-num', {},
        opts.isDM ? h('button.icon', { title: 'Runde zurück', onclick: () => opts.onRound(Math.max(1, round - 1)) }, '−') : null,
        h('b', {}, String(round)),
        opts.isDM ? h('button.icon', { title: 'Runde vor', onclick: () => opts.onRound(round + 1) }, '+') : null)));
  const effects = h('div.effects', {},
    ...(opts.effects || []).map((e) => {
      const left = remaining(e, round);
      const mine = opts.isDM || (opts.mySeat && e.ownerSeat === opts.mySeat);
      return h(`button.effect${left <= 0 ? '.over' : ''}${e.hidden ? '.secret' : ''}`, {
        title: `${e.name}: ${left > 0 ? `noch ${left} Runde${left === 1 ? '' : 'n'}` : 'vorbei'}${e.hidden ? ' · nur du siehst ihn' : ''}${mine ? ' (antippen zum Ändern)' : ''}`,
        disabled: !mine, onclick: () => effectDialog(opts, e),
      }, h('span', {}, '⏳ ', e.name), h('b', {}, left > 0 ? String(left) : 'vorbei'));
    }),
    opts.onEffectAdd ? h('button.effect.add', { title: 'Effekttimer starten (zählt pro Runde herunter)', onclick: () => effectDialog(opts, null) }, '+ ⏳') : null);
  box.append(effects);
  return box;
}

/**
 * entries: [{ id, kind, name, portraitAssetId, value, visibility?, condition?, conditions?, count?, hiddenNow? }]
 * opts: { isDM, currentId, state, onReorder, onSetCurrent, onRemove, onNext, onPrev, onClear, onValue, onVisibility, onSort }
 */
export function renderInitiative(container, entries, opts) {
  // Beim Tippen eines Initiativwerts nicht neu aufbauen.
  if (container.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  container.replaceChildren();
  const hasEffects = (opts.effects || []).length > 0;
  container.classList.toggle('empty', entries.length === 0 && !hasEffects);
  if (entries.length || hasEffects) container.append(roundBox(opts));
  if (!entries.length) {
    if (opts.isDM) container.append(h('span.hint', {}, 'Porträtleiste leer. Bei NPCs, Spielern oder markierten Figuren „In Leiste“ wählen.'));
    else if (opts.onEffectAdd && !hasEffects) container.replaceChildren();
    return;
  }
  const list = h('div.ini-list');
  let dragId = null;

  entries.forEach((e, i) => {
    const url = e.portraitAssetId && assetUrl(opts.state, e.portraitAssetId);
    const ring = e.condition ? HEALTH_COLORS[e.condition] : null;
    const dots = (e.conditions || []).slice(0, 13);
    const isCurrent = e.id === opts.currentId;
    const cls = `div.ini-item${isCurrent ? '.current' : ''}${e.condition === 'tot' ? '.defeated' : ''}${opts.isDM && e.hiddenNow ? '.hidden-for-players' : ''}`;
    const item = h(cls, {
      draggable: opts.isDM,
      title: [e.name, e.condition, ...(e.conditions || []).map((c) => c.label)].filter(Boolean).join(' · ')
        + (opts.isDM && e.hiddenNow ? ' · für Spieler gerade unsichtbar' : ''),
      ondragstart: (ev) => { dragId = e.id; ev.dataTransfer.effectAllowed = 'move'; },
      ondragover: (ev) => { if (dragId) ev.preventDefault(); },
      ondrop: (ev) => {
        ev.preventDefault();
        if (!dragId || dragId === e.id) return;
        const ids = entries.map((x) => x.id).filter((id) => id !== dragId);
        ids.splice(ids.indexOf(e.id), 0, dragId);
        dragId = null;
        opts.onReorder(ids);
      },
      onclick: () => { if (opts.isDM) opts.onSetCurrent(e.id); },
    },
    h('div.ini-portrait', { style: { ...(ring ? { boxShadow: `0 0 0 5px ${ring}` } : {}), ...(e.color ? { background: e.color } : {}) } },
      url ? h('img', { src: url, alt: '' }) : h('span', {}, initials(e.name)),
      e.count ? h('span.ini-count', {}, `×${e.count}`) : null,
      // Zustände als farbige Perlen um das Porträt herum, oben beginnend im Uhrzeigersinn
      ...dots.map((c, k) => {
        const a = (-90 + k * 26) * Math.PI / 180;
        return h('span.ini-pearl', { title: c.label, style: { background: c.color, left: `${23 + 29 * Math.cos(a)}px`, top: `${23 + 29 * Math.sin(a)}px` } });
      })),
    h('div.ini-name', {}, e.name),
    opts.isDM
      ? h('div.ini-tools', {},
        h('input.ini-value', { type: 'number', value: e.value ?? '', placeholder: 'Ini', title: 'Initiativwert',
          onclick: (ev) => ev.stopPropagation(),
          onchange: (ev) => opts.onValue(e.id, ev.target.value === '' ? null : Number(ev.target.value)),
          onkeydown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); } }),
        h('button.icon', { title: 'Nach links', onclick: (ev) => { ev.stopPropagation(); move(i, -1); } }, '‹'),
        h('button.icon', { title: 'Nach rechts', onclick: (ev) => { ev.stopPropagation(); move(i, 1); } }, '›'),
        h('button.icon', { title: 'Aus Leiste entfernen', onclick: (ev) => { ev.stopPropagation(); opts.onRemove(e.id); } }, '×'))
      : (e.value !== null && e.value !== undefined ? h('div.ini-val', {}, String(e.value)) : null),
    opts.isDM && e.kind !== 'character'
      ? h('button.ini-vis', { title: 'Wer sieht diesen Eintrag? (antippen zum Ändern)', onclick: (ev) => { ev.stopPropagation(); chooseVisibility(e, opts.onVisibility); } }, VIS[e.visibility || 'auto'])
      : null);
    list.append(item);
  });

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const ids = entries.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    opts.onReorder(ids);
  }

  container.append(list);
  if (opts.isDM) {
    container.append(h('div.ini-controls', {},
      info('initiative'),
      h('button.small', { onclick: opts.onSort, title: 'Nach Initiativwert sortieren, der Höchste beginnt' }, 'Sortieren'),
      h('button.small', { onclick: opts.onPrev, title: 'Zurück' }, '◀'),
      h('button.small.primary', { onclick: opts.onNext, title: 'Nächster ist dran' }, 'Weiter ▶'),
      h('button.small', { onclick: opts.onClear, title: 'Leiste leeren' }, 'Leeren')));
  }
}
