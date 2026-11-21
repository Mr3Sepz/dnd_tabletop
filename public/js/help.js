// Infopunkte für Einsteiger: ein kleines ⓘ, das eine kurze Regel-Erklärung zeigt.
// Texte: shared/rules-help.json (gekürzte deutsche Bearbeitung aus dem SRD 5.1, CC BY 4.0).
// Der DM kann jeden Text anpassen (z. B. bei einer missverständlichen Übersetzung oder für FAQs).
// Angepasste Texte liegen im Spielstand (state.helpTexts) und gelten für alle.

import { h, CONDITION_BY_KEY, dialog } from './util.js';

export const HELP = await fetch('/shared/rules-help.json').then((r) => r.json());

let ctx = { isDM: false, act: null };
let overrides = { terms: {}, conditions: {} };

/** Wer darf ändern? Nur der DM bekommt den Knopf „Text ändern“. */
export function setHelpContext(c) { ctx = { ...ctx, ...c }; }
/** Angepasste Texte aus dem Spielstand übernehmen. */
export function setHelpOverrides(o) { overrides = { terms: {}, conditions: {}, ...(o || {}) }; }

function termText(key) {
  const base = HELP.terms[key];
  const o = overrides.terms[key];
  if (!base && !o) return null;
  return { title: (o && o.title) || base.title, text: o ? o.lines : base.text, custom: !!o, baseTitle: base ? base.title : key };
}
function conditionText(key, fallbackLabel) {
  const o = overrides.conditions[key];
  const base = HELP.conditions[key];
  const meta = CONDITION_BY_KEY.get(key);
  return { title: meta ? meta.label : fallbackLabel, text: o ? o.lines : (base || null), custom: !!o };
}

function showHelp({ title, text, color, custom, group, key }) {
  const close = () => overlay.remove();
  const src = h('p.help-source.hidden', {}, HELP.attribution);
  const box = h('div.dialog.help', {},
    h('h3', {}, color ? h('span.swatch', { style: { background: color } }) : null, ' ', title),
    h('ul', {}, ...text.map((l) => h('li', {}, l))),
    h('p.help-source', {}, custom ? 'Vom DM angepasst · ' : '', HELP.short, ' · ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); src.classList.toggle('hidden'); } }, 'Quelle')),
    src,
    h('div.dialog-buttons', {},
      ctx.isDM && ctx.act && key ? h('button', { type: 'button', onclick: () => { close(); editHelp({ title, text, custom, group, key }); } }, '✎ Text ändern') : null,
      h('button.primary', { type: 'button', onclick: close }, 'Verstanden')));
  const overlay = h('div.overlay', { onclick: (e) => { if (e.target === overlay) close(); } }, box);
  document.body.append(overlay);
  box.querySelector('button.primary').focus();
}

async function editHelp({ title, text, custom, group, key }) {
  const r = await dialog({
    title: `Infotext ändern: ${title}`,
    body: 'Eine Zeile pro Punkt. Gilt für alle Spieler und wird im Spielstand gespeichert.',
    fields: [
      group === 'terms' ? { name: 'title', label: 'Überschrift', value: title } : null,
      { name: 'text', label: 'Text', type: 'textarea', value: text.join('\n') },
    ].filter(Boolean),
    buttons: [
      custom ? { label: 'Original wiederherstellen', value: 'reset', cls: 'danger' } : null,
      { label: 'Speichern', value: 'save' },
    ].filter(Boolean),
  });
  if (!r) return;
  if (r._button === 'reset') await ctx.act({ type: 'help.set', group, key, lines: null });
  else await ctx.act({ type: 'help.set', group, key, title: r.title || '', lines: r.text.split('\n') });
}

/** ⓘ-Knopf für einen Begriff aus HELP.terms */
export function info(key) {
  const t = termText(key);
  if (!t) return null;
  return h('button.info', {
    type: 'button', title: `Was ist das? ${t.title}`, 'aria-label': `Erklärung: ${t.title}`,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); const now = termText(key); showHelp({ ...now, group: 'terms', key }); },
  }, 'i');
}

/** Text eines Begriffs (z. B. für Dialoge), mit Anpassungen des DM. */
export function helpLines(key) { return termText(key)?.text || []; }

/** Erklärung zu einem Zustand anzeigen (eigene Zustände ohne Regeltext). */
export function showConditionHelp(c) {
  const t = conditionText(c.key, c.label);
  if (t.text) showHelp({ title: t.title, text: t.text, color: c.color, custom: t.custom, group: 'conditions', key: c.key });
  else showHelp({ title: c.label, text: ['Eigener Zustand. Was er bewirkt, legt der DM fest.'], color: c.color });
}

export function hasConditionHelp(key) { return !!HELP.conditions[key] || !!overrides.conditions[key]; }
