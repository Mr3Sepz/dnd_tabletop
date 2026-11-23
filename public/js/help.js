// Infopunkte für Einsteiger: ein kleines ⓘ, das eine kurze Regel-Erklärung zeigt.
// Texte: shared/rules-help.json (gekürzte deutsche Bearbeitung aus dem SRD 5.1, CC BY 4.0).
// Der DM kann jeden Text anpassen (z. B. bei einer missverständlichen Übersetzung oder für FAQs).
// Angepasste Texte liegen im Spielstand (state.helpTexts) und gelten für alle.

import { h, CONDITION_BY_KEY, dialog } from './util.js';
import { LANG, bi, enFor } from './i18n.js';

const [DE, EN] = await Promise.all(['/shared/rules-help.json', '/shared/rules-help.en.json'].map((u) => fetch(u).then((r) => r.json())));
/** Texte in der Sprache der Oberfläche */
export const HELP = LANG === 'en' ? EN : DE;

let ctx = { isDM: false, act: null };
let overrides = { terms: {}, conditions: {} };

/** Wer darf ändern? Nur der DM bekommt den Knopf „Text ändern“. */
export function setHelpContext(c) { ctx = { ...ctx, ...c }; }
/** Angepasste Texte aus dem Spielstand übernehmen. */
export function setHelpOverrides(o) {
  const src = LANG === 'en' ? (o && o.en) : o;
  overrides = { terms: { ...((src && src.terms) || {}) }, conditions: { ...((src && src.conditions) || {}) } };
}

function termText(key) {
  const base = HELP.terms[key];
  const o = overrides.terms[key];
  if (!base && !o) return null;
  return { title: (o && o.title) || base.title, text: o ? o.lines : base.text, custom: !!o, baseTitle: base ? base.title : key, en: LANG === 'de' && EN.terms[key] ? EN.terms[key].title : '' };
}
function conditionText(key, fallbackLabel) {
  const o = overrides.conditions[key];
  const base = HELP.conditions[key];
  const meta = CONDITION_BY_KEY.get(key);
  return { title: meta ? meta.label : fallbackLabel, text: o ? o.lines : (base || null), custom: !!o, cond: !!meta };
}

function showHelp({ title, text, color, custom, group, key, en, cond }) {
  const close = () => overlay.remove();
  const src = h('p.help-source.hidden', {}, HELP.attribution);
  const box = h('div.dialog.help', {},
    h('h3', {}, color ? h('span.swatch', { style: { background: color } }) : null, ' ',
      // Überschrift im deutschen Modus mit englischem Begriff darunter
      cond ? bi(title) : h('span.term', { 'data-raw': '' }, title, en && en !== title ? h('small.term-en', { lang: 'en' }, en) : null)),
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
    body: LANG === 'en'
      ? 'One line per point. Applies to everyone using the English version and is saved with the game. The German text is changed separately.'
      : 'Eine Zeile pro Punkt. Gilt für alle Spieler mit deutscher Oberfläche und wird im Spielstand gespeichert. Die englischen Texte änderst du getrennt in der englischen Ansicht.',
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
  if (r._button === 'reset') await ctx.act({ type: 'help.set', group, key, lang: LANG, lines: null });
  else await ctx.act({ type: 'help.set', group, key, lang: LANG, title: r.title || '', lines: r.text.split('\n') });
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
  if (t.text) showHelp({ title: LANG === 'en' ? (enFor(t.title) || t.title) : t.title, text: t.text, color: c.color, custom: t.custom, group: 'conditions', key: c.key, cond: LANG === 'de' });
  else showHelp({ title: c.label, text: ['Eigener Zustand. Was er bewirkt, legt der DM fest.'], color: c.color });
}

export function hasConditionHelp(key) { return !!HELP.conditions[key] || !!overrides.conditions[key]; }
