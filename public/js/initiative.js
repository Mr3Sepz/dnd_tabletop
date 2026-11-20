// Porträtleiste am oberen Rand = Initiative-Tracker (N7).
// DM: Initiativwert eintragen, sortieren, ziehen oder per Pfeil umstellen, weiterschalten,
// Sichtbarkeit pro Eintrag (automatisch / immer / nie). Spieler sehen nur, was sie sehen
// dürfen (der Server filtert), bei Gegnern nur den groben Zustand (N8).

import { h, assetUrl, initials, HEALTH_COLORS } from './util.js';

const VIS = { auto: ['👁', 'Automatisch: sichtbar, sobald eine Figur aufgedeckt ist'], show: ['👁‍🗨', 'Immer sichtbar'], hide: ['🚫', 'Für Spieler verborgen'] };
const NEXT_VIS = { auto: 'show', show: 'hide', hide: 'auto' };

/**
 * entries: [{ id, kind, name, portraitAssetId, value, visibility?, condition?, conditions?, count?, hiddenNow? }]
 * opts: { isDM, currentId, state, onReorder, onSetCurrent, onRemove, onNext, onPrev, onClear, onValue, onVisibility, onSort }
 */
export function renderInitiative(container, entries, opts) {
  // Beim Tippen eines Initiativwerts nicht neu aufbauen.
  if (container.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  container.replaceChildren();
  container.classList.toggle('empty', entries.length === 0);
  if (!entries.length) {
    if (opts.isDM) container.append(h('span.hint', {}, 'Porträtleiste leer. Bei NPCs, Spielern oder markierten Figuren „In Leiste“ wählen.'));
    return;
  }
  const list = h('div.ini-list');
  let dragId = null;

  entries.forEach((e, i) => {
    const url = e.portraitAssetId && assetUrl(opts.state, e.portraitAssetId);
    const ring = e.condition ? HEALTH_COLORS[e.condition] : null;
    const dots = (e.conditions || []).slice(0, 4);
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
    h('div.ini-portrait', { style: ring ? { boxShadow: `0 0 0 3px ${ring}` } : {} },
      url ? h('img', { src: url, alt: '' }) : h('span', {}, initials(e.name)),
      e.count ? h('span.ini-count', {}, `×${e.count}`) : null),
    dots.length ? h('div.ini-dots', {}, ...dots.map((c) => h('span', { style: { background: c.color }, title: c.label }))) : null,
    h('div.ini-name', {}, e.name),
    opts.isDM
      ? h('div.ini-tools', {},
        h('input.ini-value', { type: 'number', value: e.value ?? '', placeholder: 'Ini', title: 'Initiativwert',
          onclick: (ev) => ev.stopPropagation(),
          onchange: (ev) => opts.onValue(e.id, ev.target.value === '' ? null : Number(ev.target.value)),
          onkeydown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); } }),
        e.kind !== 'character' ? h('button.icon', { title: VIS[e.visibility || 'auto'][1], onclick: (ev) => { ev.stopPropagation(); opts.onVisibility(e.id, NEXT_VIS[e.visibility || 'auto']); } }, VIS[e.visibility || 'auto'][0]) : null,
        h('button.icon', { title: 'Nach links', onclick: (ev) => { ev.stopPropagation(); move(i, -1); } }, '‹'),
        h('button.icon', { title: 'Nach rechts', onclick: (ev) => { ev.stopPropagation(); move(i, 1); } }, '›'),
        h('button.icon', { title: 'Aus Leiste entfernen', onclick: (ev) => { ev.stopPropagation(); opts.onRemove(e.id); } }, '×'))
      : (e.value !== null && e.value !== undefined ? h('div.ini-val', {}, String(e.value)) : null));
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
      h('button.small', { onclick: opts.onSort, title: 'Nach Initiativwert sortieren, der Höchste beginnt' }, 'Sortieren'),
      h('button.small', { onclick: opts.onPrev, title: 'Zurück' }, '◀'),
      h('button.small.primary', { onclick: opts.onNext, title: 'Nächster ist dran' }, 'Weiter ▶'),
      h('button.small', { onclick: opts.onClear, title: 'Leiste leeren' }, 'Leeren')));
  }
}
