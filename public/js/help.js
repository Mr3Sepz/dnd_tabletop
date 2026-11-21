// Infopunkte für Einsteiger: ein kleines ⓘ, das eine kurze Regel-Erklärung zeigt.
// Texte: shared/rules-help.json (gekürzte deutsche Bearbeitung aus dem SRD 5.1, CC BY 4.0).

import { h, CONDITION_BY_KEY } from './util.js';

export const HELP = await fetch('/shared/rules-help.json').then((r) => r.json());

function showHelp(title, lines, color) {
  const close = () => overlay.remove();
  const box = h('div.dialog.help', {},
    h('h3', {}, color ? h('span.swatch', { style: { background: color } }) : null, ' ', title),
    h('ul', {}, ...lines.map((l) => h('li', {}, l))),
    h('p.help-source', {}, HELP.short, ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); src.classList.toggle('hidden'); } }, 'Quelle')),
    h('div.dialog-buttons', {}, h('button.primary', { type: 'button', onclick: close }, 'Verstanden')));
  const src = h('p.help-source.hidden', {}, HELP.attribution);
  box.insertBefore(src, box.lastChild);
  const overlay = h('div.overlay', { onclick: (e) => { if (e.target === overlay) close(); } }, box);
  document.body.append(overlay);
  box.querySelector('button.primary').focus();
}

/** ⓘ-Knopf für einen Begriff aus HELP.terms */
export function info(key) {
  const t = HELP.terms[key];
  if (!t) return null;
  return h('button.info', {
    type: 'button', title: `Was ist das? ${t.title}`, 'aria-label': `Erklärung: ${t.title}`,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); showHelp(t.title, t.text); },
  }, 'i');
}

/** Erklärung zu einem Zustand anzeigen (eigene Zustände ohne Regeltext). */
export function showConditionHelp(c) {
  const lines = HELP.conditions[c.key];
  const meta = CONDITION_BY_KEY.get(c.key);
  if (lines) showHelp(meta ? meta.label : c.label, lines, c.color);
  else showHelp(c.label, ['Eigener Zustand. Was er bewirkt, legt der DM fest.'], c.color);
}

export function hasConditionHelp(key) { return !!HELP.conditions[key]; }
