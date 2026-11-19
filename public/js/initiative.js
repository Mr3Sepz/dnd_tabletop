// Porträtleiste am oberen Rand = Initiative-Tracker (N7, ersetzt X3).
// Alle sehen sie. Der DM legt die Reihenfolge per Ziehen (Maus) oder mit
// Pfeilen (Touch) fest und schaltet weiter. Spieler sehen bei Gegnern nur
// den groben Zustand (N8) als farbigen Ring.

import { h, assetUrl, initials, CONDITION_COLORS } from './util.js';

/**
 * entries: [{ id, name, portraitAssetId, kind, condition?, hpRatio? }]
 * opts: { isDM, current, state, onReorder(ids), onSetCurrent(id), onRemove(id), onNext(), onPrev(), onClear() }
 */
export function renderInitiative(container, entries, opts) {
  container.replaceChildren();
  container.classList.toggle('empty', entries.length === 0);
  if (!entries.length) {
    if (opts.isDM) container.append(h('span.hint', {}, 'Porträtleiste leer. Bei NPCs oder Spielern „In Leiste“ wählen.'));
    return;
  }
  const list = h('div.ini-list');
  let dragId = null;

  entries.forEach((e, i) => {
    const url = e.portraitAssetId && assetUrl(opts.state, e.portraitAssetId);
    const ring = e.condition ? CONDITION_COLORS[e.condition] : null;
    const item = h(`div.ini-item${i === opts.current ? '.current' : ''}${e.condition === 'besiegt' ? '.defeated' : ''}`, {
      draggable: opts.isDM,
      title: e.condition ? `${e.name}: ${e.condition}` : e.name,
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
      url ? h('img', { src: url, alt: '' }) : h('span', {}, initials(e.name))),
    h('div.ini-name', {}, e.name),
    opts.isDM ? h('div.ini-tools', {},
      h('button.icon', { title: 'Nach links', onclick: (ev) => { ev.stopPropagation(); move(i, -1); } }, '‹'),
      h('button.icon', { title: 'Aus Leiste entfernen', onclick: (ev) => { ev.stopPropagation(); opts.onRemove(e.id); } }, '×'),
      h('button.icon', { title: 'Nach rechts', onclick: (ev) => { ev.stopPropagation(); move(i, 1); } }, '›')) : null);
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
      h('button.small', { onclick: opts.onPrev, title: 'Zurück' }, '◀'),
      h('button.small.primary', { onclick: opts.onNext, title: 'Nächster ist dran' }, 'Weiter ▶'),
      h('button.small', { onclick: opts.onClear, title: 'Leiste leeren' }, 'Leeren')));
  }
}
