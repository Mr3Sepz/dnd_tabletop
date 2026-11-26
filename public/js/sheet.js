// Charakterbogen für Spielercharaktere und NPCs:
// HP (C2), Zustände, Todesrettungswürfe, weitere Werte wie RK (C7),
// Zauberplätze als Rauten (C3), Zähler mit Vorlagen (C4), Notizen (T3 bzw. NPC-Notiz).
// Zauberplätze und Zähler lassen sich pro Charakter ausblenden ("Bogen anpassen").
// Das Inventar mit Münzen hat einen eigenen Bereich (inventory.js).
//
// Damit beim Tippen nichts springt, wird der Bogen nur neu aufgebaut, wenn
// sich seine Struktur ändert und gerade kein Feld darin bearbeitet wird.
// Sonst werden nur die Werte der nicht fokussierten Felder aktualisiert.

import { h, debounce, assetUrl, initials, dialog } from './util.js';
import { editConditions, conditionChips } from './conditions.js';
import { info } from './help.js';
import { lockButton, applyLocks } from './lock.js';
import { term, termText, enFor, LANG } from './i18n.js';
import { GLOSSARY } from './glossary.js';

const uid = (p) => p + Math.random().toString(36).slice(2, 10);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/** Fertige Zähler, die man per Haken hinzufügt oder wegklickt. */
// Name in der aktuellen Sprache; erkannt werden deutsche und englische Namen.
export const COUNTER_PRESETS = [
  { key: 'inspiration', max: 1 },
  { key: 'healingPotions', max: 2 },
  { key: 'rage', max: 2 },
  { key: 'ki', max: 2 },
  { key: 'secondWind', max: 1 },
  { key: 'actionSurge', max: 1 },
  { key: 'bardicInspiration', max: 3 },
  { key: 'channelDivinity', max: 1 },
  { key: 'layOnHands', max: 5 },
  { key: 'sorceryPoints', max: 2 },
  { key: 'wildShape', max: 2 },
  { key: 'exhaustionLevel', max: 6, cur: 0 },
  { key: 'ammunition', max: 20 },
].map((p) => ({ ...p, name: termText(p.key) }));

/** Englischer Begriff klein unter einem Eingabefeld (nur im deutschen Modus). */
const enHint = (deText) => {
  const en = LANG === 'de' ? enFor(deText) : '';
  return en && en.toLowerCase() !== String(deText).trim().toLowerCase() ? h('small.term-en.under', { lang: 'en' }, en) : null;
};

/** Abhakungen der einzelnen Zauberplätze (Länge = max); ältere Stände: die ersten „used“. */
function slotMarks(sl) {
  return Array.from({ length: sl.max }, (_, i) => (Array.isArray(sl.marks) && sl.marks.length ? !!sl.marks[i] : i < (sl.used || 0)));
}

export class Sheet {
  /**
   * opts: {
   *   kind: 'character' | 'npc',
   *   onPatch(patch),
   *   showInventory, showPrivateNotes, showNote,
   *   canPickPortrait, onPickPortrait(),   // DM: Bild wählen
   *   actions: [{ label, onClick }]        // zusätzliche Knöpfe oben
   * }
   */
  constructor(container, opts) {
    this.container = container;
    this.opts = opts;
    this.data = null;
    this.signature = '';
    this.textCommit = new Map();
  }

  focusedInside() {
    return this.container.contains(document.activeElement) && document.activeElement !== document.body
      && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  }

  update(data, state) {
    this.data = JSON.parse(JSON.stringify(data));
    this.state = state;
    const sig = JSON.stringify([
      data.id, data.portraitAssetId, data.portraitAssetId && assetUrl(this.state, data.portraitAssetId), (data.stats || []).map((s) => s.id), (data.counters || []).map((c) => c.id),
      (data.conditions || []).map((c) => c.id), data.hp.cur <= 0, !!data.dead, data.deathSaves,
      (data.slots || []).map((s) => s.max), (data.slots || []).some((s) => s.used), (this.opts.actions || []).map((a) => a.label),
      data.sheetPrefs, (data.weapons || []).map((w) => [w.id, !!w.ammo]),
    ]);
    if (sig !== this.signature && !this.focusedInside()) {
      this.signature = sig;
      this.render();
    } else {
      this.refreshValues();
    }
  }

  patch(p) {
    // Lokal sofort übernehmen, damit schnelle Klicks aufeinander aufbauen.
    Object.assign(this.data, JSON.parse(JSON.stringify(p)));
    this.opts.onPatch(p);
  }

  refreshValues() {
    for (const el of this.container.querySelectorAll('[data-bind]')) {
      if (el === document.activeElement) continue;
      const v = this.read(el.dataset.bind);
      if (v === undefined) continue;
      if (el.type === 'checkbox') el.checked = !!v; else if (el.value !== String(v)) el.value = v;
    }
    for (const el of this.container.querySelectorAll('[data-slot-level]')) this.renderSlotBoxes(el, Number(el.dataset.slotLevel));
    const bar = this.container.querySelector('.hpbar > div');
    if (bar) bar.style.width = `${this.hpRatio() * 100}%`;
  }

  read(bind) {
    const d = this.data;
    const [a, b, c] = bind.split(':');
    if (a === 'hp') return d.hp[b];
    if (a === 'stat') return d.stats.find((s) => s.id === b)?.[c];
    if (a === 'counter') return d.counters.find((s) => s.id === b)?.[c];
    if (a === 'slotmax') return d.slots.find((s) => s.level === Number(b))?.max;
    if (a === 'weapon') { const w = (d.weapons || []).find((x) => x.id === b); return c === 'ammoCur' ? w?.ammo?.cur : c === 'ammoMax' ? w?.ammo?.max : w?.[c]; }
    return d[a];
  }

  hpRatio() {
    const { cur, max } = this.data.hp;
    return max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  }

  render() {
    const d = this.data;
    const o = this.opts;
    const c = this.container;
    c.replaceChildren();
    c.classList.add('sheet');

    // Kopf: Bild, Name, Zusatzknöpfe
    const portraitUrl = d.portraitAssetId && assetUrl(this.state, d.portraitAssetId);
    c.append(h('div.sheet-head', {},
      h('button.portrait', {
        title: o.canPickPortrait ? 'Porträt wählen' : '',
        disabled: !o.canPickPortrait,
        onclick: () => o.onPickPortrait?.(),
      }, portraitUrl ? h('img', { src: portraitUrl, alt: '' }) : h('span', {}, initials(d.name)), o.mark ? o.mark() : null),
      h('input.name', { 'data-bind': 'name', 'data-lock': '', value: d.name, 'aria-label': 'Name', onchange: (e) => this.patch({ name: e.target.value }) }),
      ...(o.actions || []).map((a) => h('button.small', { onclick: a.onClick, title: a.title || '' }, a.label)),
      lockButton(),
      h('button.small', { title: 'Zauberplätze und Zähler ein- oder ausblenden, Zähler-Vorlagen', onclick: () => this.customize() }, '⚙ Bogen anpassen')));
    const prefs = d.sheetPrefs || { slots: true, counters: true };

    // HP
    const hpNum = (key, label) => h('label.num', {}, h('span', {}, typeof label === 'string' ? label : label),
      h('input', { type: 'number', min: 0, 'data-bind': `hp:${key}`, 'data-lock': '', value: d.hp[key], inputmode: 'numeric',
        onchange: (e) => this.patch({ hp: { ...this.data.hp, [key]: Number(e.target.value) || 0 } }) }));
    const amount = h('input.amount', { type: 'number', min: 0, placeholder: 'Betrag', inputmode: 'numeric' });
    const apply = (sign) => {
      const n = Math.abs(Number(amount.value) || 0);
      if (!n) return;
      const hp = { ...this.data.hp };
      if (sign < 0) {
        const fromTemp = Math.min(hp.temp, n);
        hp.temp -= fromTemp;
        hp.cur = Math.max(0, hp.cur - (n - fromTemp));
      } else {
        hp.cur = Math.min(hp.max, hp.cur + n);
      }
      amount.value = '';
      this.patch({ hp });
      this.refreshValues();
    };
    c.append(h('section', {},
      h('h4', {}, term('hp'), ' ', info('hp')),
      h('div.hpbar', {}, h('div', { style: { width: `${this.hpRatio() * 100}%` } })),
      h('div.row', {}, hpNum('cur', 'Aktuell'), hpNum('max', 'Maximum'), h('div.with-info', {}, hpNum('temp', term('tempShort')), info('tempHp'))),
      h('div.row', {}, amount,
        h('button.danger.small', { onclick: () => apply(-1) }, 'Schaden'),
        h('button.good.small', { onclick: () => apply(1) }, 'Heilung'))));

    // Am Boden: Todesrettungswürfe (P4) und für NPCs "tot oder am Boden" (P5)
    if (d.hp.cur <= 0) {
      const ds = d.deathSaves || { success: 0, fail: 0 };
      const row = (key, label, cls) => h('div.saves', {}, h('span', {}, term(label)),
        ...[1, 2, 3].map((i) => h(`button.save${i <= ds[key] ? `.${cls}` : ''}`, {
          title: `${termText(label)} ${i}`,
          onclick: () => { this.patch({ deathSaves: { ...this.data.deathSaves, [key]: i <= this.data.deathSaves[key] ? i - 1 : i } }); this.signature = ''; this.render(); },
        })));
      c.append(h('section.down', {},
        // NPCs würfeln keine Todesrettungswürfe: nur „am Boden“ oder „tot“
        o.kind === 'npc'
          ? h('h4', {}, d.dead ? 'Tot' : 'Am Boden (bewusstlos)')
          : h('h4', {}, 'Am Boden: ', term('deathSaves'), ' ', info('deathSaves')),
        o.kind === 'npc' ? h('div.row', {},
          h(`button.small${d.dead ? '' : '.primary'}`, { onclick: () => { this.patch({ dead: false }); } }, 'Am Boden'),
          h(`button.small${d.dead ? '.danger' : ''}`, { onclick: () => { this.patch({ dead: true }); } }, 'Tot'),
          h('span.hint', {}, 'Spieler sehen „am Boden“ oder „tot“.')) : null,
        o.kind === 'npc' ? null : row('success', 'successes', 'ok'),
        o.kind === 'npc' ? null : row('fail', 'failures', 'bad')));
    }

    // Zustände (P4)
    c.append(h('section', {},
      h('h4', {}, term('conditions'), ' ', h('button.small', { onclick: async () => {
        const list = await editConditions(this.data.conditions || [], `Zustände: ${this.data.name}`);
        if (list) this.opts.onConditions ? this.opts.onConditions(list) : null;
      } }, 'Ändern')),
      (d.conditions || []).length
        ? conditionChips(d.conditions, (cnd) => this.opts.onConditions?.(this.data.conditions.filter((x) => x.id !== cnd.id)))
        : h('p.hint', {}, 'Keine.')));

    // Werte (C7): bei Spielercharakteren hier, bei NPCs ganz unten direkt über den Attributen
    if (!o.statsLast) this.renderStats(c);

    // Angriffe (nur NPCs): aufgebaut wie „Aktuelle Waffen“ im Inventar
    if (o.showAttacks) c.append(this.renderAttacks());

    // Zauberplätze (C3) als blaue Rauten mit Grad I–IX; verbraucht = stark ausgegraut.
    // Normal sieht man nur Grade mit Plätzen; "Anzahl ändern" zeigt alle 9.
    if (prefs.slots) {
      const editing = !!this.editSlots;
      const slots = h('div.slots');
      for (const sl of d.slots) {
        if (!editing && sl.max === 0) continue;
        const boxes = h('div.boxes', { dataset: { slotLevel: sl.level } });
        this.renderSlotBoxes(boxes, sl.level);
        slots.append(h('div.slot', {},
          h('span.lvl', {}, `${termText('spellLevel')} ${ROMAN[sl.level - 1]}`),
          editing ? h('input.max', { type: 'number', min: 0, max: 99, value: sl.max, 'data-bind': `slotmax:${sl.level}`, title: `Anzahl Plätze Grad ${ROMAN[sl.level - 1]}`,
            onchange: (e) => this.editSlot(sl.level, { max: Number(e.target.value) || 0 }) }) : null,
          boxes));
      }
      if (!slots.childElementCount) slots.append(h('p.hint', {}, 'Keine Zauberplätze. Mit „Anzahl ändern“ einrichten oder unter „Bogen anpassen“ ausblenden.'));
      c.append(h('section', {},
        h('h4', {}, term('spellSlots'), ' ', info('spellSlots'),
          h('button.small', { onclick: () => { this.editSlots = !editing; this.render(); } }, editing ? 'Fertig' : 'Anzahl ändern'),
          d.slots.some((s) => s.used) ? h('button.small', { title: 'Alle Plätze wieder frei (z. B. nach einer langen Rast)', onclick: () => {
            this.patch({ slots: this.data.slots.map((s) => ({ ...s, used: 0, marks: Array(s.max).fill(false) })) }); this.refreshValues();
          } }, 'Alle frei') : null),
        slots));
    }

    // Zähler (C4)
    if (prefs.counters) {
      const counters = h('div.counters');
      for (const k of d.counters) {
        counters.append(h('div.counter', {},
          h('div.counter-label', {}, h('input.label', { value: k.name, 'data-lock': '', placeholder: 'z. B. Ki-Punkte', 'data-bind': `counter:${k.id}:name`, onchange: (e) => this.editCounter(k.id, { name: e.target.value }) }), enHint(k.name)),
          h('button.small', { onclick: () => this.editCounter(k.id, { cur: Math.max(0, this.read(`counter:${k.id}:cur`) - 1) }) }, '−'),
          h('input.cur', { type: 'number', min: 0, 'data-lock': '', value: k.cur, 'data-bind': `counter:${k.id}:cur`, onchange: (e) => this.editCounter(k.id, { cur: Number(e.target.value) || 0 }) }),
          h('span', {}, '/'),
          h('input.cur', { type: 'number', min: 0, 'data-lock': '', value: k.max, 'data-bind': `counter:${k.id}:max`, title: 'Höchstwert', onchange: (e) => this.editCounter(k.id, { max: Number(e.target.value) || 0 }) }),
          h('button.small', { onclick: () => this.editCounter(k.id, { cur: Math.min(this.read(`counter:${k.id}:max`), this.read(`counter:${k.id}:cur`) + 1) }) }, '+'),
          h('button.icon', { title: 'Entfernen', 'data-lock': '', onclick: () => this.patch({ counters: this.data.counters.filter((x) => x.id !== k.id) }) }, '×')));
      }
      c.append(h('section', {},
        h('h4', {}, 'Zähler ', info('counters'), h('button.small', { 'data-lock': '', onclick: () => this.patch({ counters: [...this.data.counters, { id: uid('k_'), name: '', cur: 0, max: 1 }] }) }, '+ Zähler')),
        d.counters.length ? counters : h('p.hint', {}, 'Keine. Fertige Vorlagen gibt es unter „Bogen anpassen“.')));
    }

    // Texte
    const textArea = (key, title, placeholder) => {
      const commit = debounce((v) => this.patch({ [key]: v }), 600);
      return h('section', {}, h('h4', {}, title),
        h('textarea', { rows: 6, 'data-bind': key, placeholder, oninput: (e) => commit(e.target.value), onblur: (e) => this.patch({ [key]: e.target.value }) }, d[key] || ''));
    };
    if (o.showPrivateNotes) c.append(textArea('privateNotes', 'Mein Notizbuch (nur für mich, auch der DM sieht es nicht)', 'Notizen …'));
    if (o.showNote) c.append(textArea('note', 'Notiz zu diesem NPC', 'Wer ist das? Was will er?'));
    if (o.statsLast) this.renderStats(c);
    applyLocks(c);
  }

  renderStats(c) {
    const d = this.data;
    const stats = h('div.stats');
    for (const s of d.stats) {
      stats.append(h('div.stat', {},
        h('div.stat-label', {}, h('input.label', { value: s.label, 'data-lock': '', 'data-bind': `stat:${s.id}:label`, placeholder: 'Wert', onchange: (e) => this.editStat(s.id, { label: e.target.value }) }), enHint(s.label)),
        h('input.value', { value: s.value, 'data-lock': '', 'data-bind': `stat:${s.id}:value`, placeholder: '–', onchange: (e) => this.editStat(s.id, { value: e.target.value }) }),
        h('button.icon', { title: 'Entfernen', 'data-lock': '', onclick: () => this.patch({ stats: this.data.stats.filter((x) => x.id !== s.id) }) }, '×')));
    }
    c.append(h('section', {},
      h('h4', {}, 'Werte ', info('ac'), h('button.small', { 'data-lock': '', onclick: () => this.patch({ stats: [...this.data.stats, { id: uid('s_'), label: '', value: '' }] }) }, '+ Wert')),
      stats));

  }

  /** Angriffe eines NPCs: Name, Angriffsbonus, Schaden/Art, optional Munition – wie die Waffen im Inventar. */
  renderAttacks() {
    const d = this.data;
    const list = d.weapons || [];
    const setList = (items) => { this.patch({ weapons: items }); this.signature = ''; this.render(); };
    const edit = (id, p) => this.patch({ weapons: (this.data.weapons || []).map((x) => (x.id === id ? { ...x, ...p } : x)) });
    const field = (w, key, label, opts = {}) => h('label.gear-field', { style: opts.grow ? { flex: opts.grow } : {} },
      h('span', {}, opts.term ? term(opts.term) : label, opts.info ? info(opts.info) : null),
      h('input', { value: w[key] || '', placeholder: opts.placeholder || '', 'data-lock': '', 'data-bind': `weapon:${w.id}:${key}`,
        onchange: (e) => edit(w.id, { [key]: e.target.value }) }));
    const setAmmo = (id, cur) => {
      const w = (this.data.weapons || []).find((x) => x.id === id);
      if (!w || !w.ammo) return;
      edit(id, { ammo: { ...w.ammo, cur: Math.max(0, Math.min(w.ammo.max, cur)) } });
      this.refreshValues();
    };
    const rows = list.map((w) => h('div.gear', {},
      h('div.gear-row', {},
        field(w, 'name', 'Name', { grow: 3, placeholder: 'z. B. Krummsäbel' }),
        field(w, 'attack', 'Angr. Bonus', { grow: 1, placeholder: '+4', info: 'attackBonus', term: 'attackBonus' }),
        field(w, 'damage', 'Schaden/Art', { grow: 2, placeholder: LANG === 'en' ? '1d6+2 slashing' : '1W6+2 Hieb', term: 'damageType' }),
        h('button.icon', { title: 'Angriff entfernen', 'data-lock': '', onclick: () => setList((this.data.weapons || []).filter((x) => x.id !== w.id)) }, '×')),
      w.ammo
        ? h('div.ammo', {},
          h('span', { 'data-raw': '' }, '🏹 ', w.ammo.name || termText('ammunition')),
          h('button.small', { title: 'Einen verschießen', onclick: () => setAmmo(w.id, ((this.data.weapons || []).find((x) => x.id === w.id)?.ammo?.cur || 0) - 1) }, '−'),
          h('input.cur', { type: 'number', min: 0, value: w.ammo.cur, 'data-lock': '', 'data-bind': `weapon:${w.id}:ammoCur`, onchange: (e) => setAmmo(w.id, Number(e.target.value) || 0) }),
          h('span', {}, '/'),
          h('input.cur', { type: 'number', min: 0, value: w.ammo.max, title: 'Höchstwert', 'data-lock': '', 'data-bind': `weapon:${w.id}:ammoMax`,
            onchange: (e) => { const max = Math.max(0, Number(e.target.value) || 0); const cur = (this.data.weapons || []).find((x) => x.id === w.id)?.ammo; edit(w.id, { ammo: { ...cur, max, cur: Math.min(cur.cur, max) } }); } }),
          h('button.small', { title: 'Einen aufsammeln', onclick: () => setAmmo(w.id, ((this.data.weapons || []).find((x) => x.id === w.id)?.ammo?.cur || 0) + 1) }, '+'),
          h('button.icon', { title: 'Munitionszähler entfernen', 'data-lock': '', onclick: () => setList((this.data.weapons || []).map((x) => (x.id === w.id ? { ...x, ammo: null } : x))) }, '×'))
        : h('button.small.link-like', { 'data-lock': '', onclick: async () => {
          const r = await dialog({ title: 'Munitionszähler', fields: [
            { name: 'name', label: 'Was wird gezählt?', value: /armbrust|crossbow/i.test(w.name) ? termText('bolts') : termText('arrows') },
            { name: 'max', label: 'Anzahl', type: 'number', min: 0, value: 20 }], okText: 'Hinzufügen' });
          if (r) setList((this.data.weapons || []).map((x) => (x.id === w.id ? { ...x, ammo: { name: r.name, max: r.max || 0, cur: r.max || 0 } } : x)));
        } }, '+ Munitionszähler')));
    return h('section.attacks', {},
      h('h4', {}, 'Angriffe ', info('attackBonus'),
        h('button.small', { 'data-lock': '', onclick: () => setList([...(this.data.weapons || []), { id: uid('wa_'), name: '', attack: '', damage: '', ammo: null }]) }, '+ Angriff')),
      rows.length ? h('div.gear-list', {}, ...rows) : h('p.hint', {}, 'Keine. Mit „+ Angriff“ z. B. Krummsäbel, Kurzbogen oder Biss eintragen.'));
  }

  renderSlotBoxes(el, level) {
    const sl = this.data.slots.find((s) => s.level === level);
    if (!sl) return;
    // Jeder Platz einzeln: nur der angetippte wird verbraucht oder wieder frei
    const marks = slotMarks(sl);
    if (el.childElementCount === sl.max && [...el.children].every((b, i) => b.classList.contains('used') === marks[i])) return;
    el.replaceChildren(...Array.from({ length: sl.max }, (_, i) => h(`button.diamond${marks[i] ? '.used' : ''}`, {
      title: `Grad ${ROMAN[level - 1]}: ${marks[i] ? 'verbraucht (antippen = wieder frei)' : 'frei (antippen = verbraucht)'}`,
      'aria-label': `Zauberplatz Grad ${ROMAN[level - 1]} ${marks[i] ? 'verbraucht' : 'frei'}`,
      onclick: () => { const m = slotMarks(this.data.slots.find((s) => s.level === level)); m[i] = !m[i]; this.editSlot(level, { marks: m }); },
    }, h('span', {}, ROMAN[level - 1]))));
  }

  /** Bogen anpassen: Bereiche ein-/ausblenden, Zähler-Vorlagen an- oder abhaken. */
  async customize() {
    const d = this.data;
    const prefs = d.sheetPrefs || { slots: true, counters: true };
    // Vorlagen auf Deutsch und Englisch erkennen
    const norm = (x) => String(x || '').trim().toLowerCase();
    const presetOf = (name) => COUNTER_PRESETS.find((p) => [GLOSSARY[p.key].de, GLOSSARY[p.key].en, ...(GLOSSARY[p.key].alt || [])].some((x) => norm(x) === norm(name)));
    const present = new Set(d.counters.map((k) => presetOf(k.name)?.key).filter(Boolean));
    const r = await dialog({
      title: `Bogen anpassen: ${d.name}`,
      body: 'Wer keine Zauber wirkt (z. B. ein Krieger), blendet die Zauberplätze einfach aus. Vorlagen lassen sich jederzeit an- und abhaken.',
      fields: [
        { name: 'slots', label: 'Zauberplätze anzeigen', type: 'checkbox', value: prefs.slots },
        { name: 'counters', label: 'Zähler anzeigen', type: 'checkbox', value: prefs.counters },
        { name: 'presets', label: 'Zähler-Vorlagen', type: 'checks', value: COUNTER_PRESETS.filter((p) => present.has(p.key)).map((p) => p.key),
          options: COUNTER_PRESETS.map((p) => ({ value: p.key, label: h('span', {}, term(p.key), ` (${p.max})`) })) },
      ],
      okText: 'Übernehmen',
    });
    if (!r) return;
    const wanted = new Set(r.presets);
    const counters = d.counters.filter((k) => { const p = presetOf(k.name); return !p || wanted.has(p.key); });
    for (const p of COUNTER_PRESETS) {
      if (wanted.has(p.key) && !present.has(p.key)) counters.push({ id: uid('k_'), name: p.name, max: p.max, cur: p.cur ?? p.max });
    }
    this.patch({ sheetPrefs: { slots: r.slots, counters: r.counters || wanted.size > 0 }, counters });
    this.signature = '';
    this.render();
  }

  editStat(id, p) { this.patch({ stats: this.data.stats.map((s) => (s.id === id ? { ...s, ...p } : s)) }); }
  editCounter(id, p) {
    this.patch({ counters: this.data.counters.map((k) => {
      if (k.id !== id) return k;
      const n = { ...k, ...p };
      n.cur = Math.min(n.cur, n.max);
      return n;
    }) });
    this.refreshValues();
  }
  editSlot(level, p) {
    this.patch({ slots: this.data.slots.map((s) => {
      if (s.level !== level) return s;
      const n = { ...s, ...p };
      n.marks = slotMarks(n);
      n.used = n.marks.filter(Boolean).length;
      return n;
    }) });
    this.refreshValues();
  }
}
