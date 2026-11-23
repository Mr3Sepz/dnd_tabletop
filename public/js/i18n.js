// Sprache der Oberfläche: Deutsch (Standard) oder Englisch (UK).
//
// Deutsch: DnD-Fachbegriffe stehen zweisprachig da, der englische Begriff klein darunter
//          (Stärke / Strength, Zauberplätze / Spell Slots …) – term() und bi().
// Englisch: Die ganze Oberfläche ist englisch. Fachbegriffe kommen aus dem Glossar, alle
//          übrigen Texte übersetzt ein Wörterbuch (shared/i18n-en.json) direkt im DOM:
//          Ein MutationObserver ersetzt deutsche Texte, Titel und Platzhalter, sobald sie
//          erscheinen. So bleibt der restliche Code einsprachig und übersichtlich.
//          Nutzerinhalte (Namen, Chat, Notizen) sind mit data-raw markiert und bleiben unberührt.
//
// Die Wahl gilt pro Gerät (localStorage). Ohne Wahl: Deutsch, wenn der Browser deutsch ist.

import { GLOSSARY } from './glossary.js';

const STORE = 'dnd.lang';
function detect() {
  try { const v = localStorage.getItem(STORE); if (v === 'de' || v === 'en') return v; } catch { /* egal */ }
  return /^de\b/i.test(navigator.language || 'de') ? 'de' : 'en';
}
export const LANG = detect();
document.documentElement.lang = LANG === 'en' ? 'en-GB' : 'de';

export function setLang(l) {
  try { localStorage.setItem(STORE, l); } catch { /* egal */ }
  location.reload();
}

/** Kleiner Umschalter „DE | EN“. */
export function langSwitch() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon lang-switch';
  b.title = LANG === 'en' ? 'Auf Deutsch umschalten' : 'Switch to English (UK)';
  b.textContent = LANG === 'en' ? 'DE' : 'EN';
  b.onclick = () => setLang(LANG === 'en' ? 'de' : 'en');
  return b;
}

// Umschalter in die Kopfzeile (vor den Verbindungspunkt) bzw. auf die Startseite setzen.
function placeSwitch() {
  if (document.querySelector('.lang-switch')) return;
  const conn = document.querySelector('.topbar #conn');
  if (conn) { conn.before(langSwitch()); return; }
  const host = document.querySelector('[data-lang-switch]');
  if (host) host.append(langSwitch());
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', placeSwitch); else placeSwitch();

// ---------------------------------------------------------------- Glossar (Fachbegriffe)

const BY_DE = new Map();
for (const [k, v] of Object.entries(GLOSSARY)) { BY_DE.set(v.de.toLowerCase(), k); if (v.alt) for (const a of v.alt) BY_DE.set(a.toLowerCase(), k); }

/** Begriff als reiner Text in der aktuellen Sprache. */
export function termText(key) {
  const g = GLOSSARY[key];
  if (!g) return key;
  return LANG === 'en' ? g.en : g.de;
}

/** Englischer Begriff zu einem Glossar-Schlüssel. */
export const termEn = (key) => GLOSSARY[key]?.en || '';

function termNode(de, en) {
  const span = document.createElement('span');
  span.className = 'term';
  if (LANG === 'en') { span.textContent = en; span.setAttribute('data-raw', ''); return span; }
  span.append(de);
  if (en && en.toLowerCase() !== de.toLowerCase()) {
    const small = document.createElement('small');
    small.className = 'term-en';
    small.lang = 'en';
    small.textContent = en;
    span.append(small);
  }
  span.setAttribute('data-raw', '');
  return span;
}

/** Fachbegriff als Element: Deutsch mit Englisch darunter, bzw. nur Englisch. */
export function term(key) {
  const g = GLOSSARY[key];
  if (!g) return document.createTextNode(key);
  return termNode(g.de, g.en);
}

/** Zweisprachig, wenn der deutsche Text ein Fachbegriff ist (z. B. ein Wert „RK“); sonst Text. */
export function bi(deText) {
  const k = BY_DE.get(String(deText || '').trim().toLowerCase());
  if (!k) return document.createTextNode(deText || '');
  return termNode(String(deText), GLOSSARY[k].en);
}

/** Englisch zu einem deutschen Fachbegriff (oder ''), z. B. für Platzhalter. */
export function enFor(deText) {
  const k = BY_DE.get(String(deText || '').trim().toLowerCase());
  return k ? GLOSSARY[k].en : '';
}

// ---------------------------------------------------------------- Englische Oberfläche

let DICT = null;
let PATTERNS = [];

/** Deutschen Text übersetzen (im deutschen Modus unverändert). */
export function tr(s) {
  if (LANG !== 'en' || s == null) return s;
  const str = String(s);
  const trimmed = str.trim();
  if (!trimmed) return str;
  const out = translateCore(trimmed);
  if (out === null) return str;
  return str.replace(trimmed, out);
}

function translateCore(t) {
  if (DICT.has(t)) return DICT.get(t);
  const k = BY_DE.get(t.toLowerCase());
  if (k) return GLOSSARY[k].en;
  for (const [re, rep] of PATTERNS) {
    const m = t.match(re);
    if (m) return rep.replace(/\$(\d)/g, (_, i) => { const g = m[Number(i)] ?? ''; const x = translateCore(g); return x === null ? g : x; });
  }
  return null;
}

const ATTRS = ['title', 'placeholder', 'aria-label'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

function skipEl(el) {
  return !el || SKIP.has(el.tagName) || (el.closest && el.closest('[data-raw]'));
}
/** Titel und Platzhalter übersetzen, auch bei Textfeldern (deren Inhalt bleibt). */
function translateAttrs(el) {
  if (!el || el.nodeType !== 1 || (el.closest && el.closest('[data-raw]'))) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const n = tr(v); if (n !== v) el.setAttribute(a, n); }
  }
}

function translateNode(node) {
  if (node.nodeType === 3) {
    if (skipEl(node.parentElement)) return;
    const v = node.nodeValue;
    const n = tr(v);
    if (n !== v) node.nodeValue = n;
    return;
  }
  if (node.nodeType !== 1) return;
  if (node.tagName === 'TEXTAREA') { translateAttrs(node); return; }
  if (skipEl(node)) return;
  translateAttrs(node);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType === 1 && n.tagName === 'TEXTAREA') { translateAttrs(n); return NodeFilter.FILTER_REJECT; }
      return n.nodeType === 1 && skipEl(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let n = walker.nextNode();
  while (n) {
    if (n.nodeType === 3) {
      const v = n.nodeValue; const t = tr(v);
      if (t !== v) n.nodeValue = t;
    } else {
      for (const a of ATTRS) {
        const v = n.getAttribute(a);
        if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); }
      }
    }
    n = walker.nextNode();
  }
}

if (LANG === 'en') {
  const d = await fetch('/shared/i18n-en.json').then((r) => r.json());
  DICT = new Map(Object.entries(d.strings));
  PATTERNS = d.patterns.map(([re, rep]) => [new RegExp(`^${re}$`, 's'), rep]);
  const run = () => {
    translateNode(document.body);
    if (document.title) document.title = tr(document.title);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') translateNode(m.target);
        else if (m.type === 'attributes') translateAttrs(m.target);
        else for (const a of m.addedNodes) translateNode(a);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
}
