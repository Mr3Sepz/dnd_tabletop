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

const uid = (p) => p + Math.random().toString(36).slice(2, 10);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/** Fertige Zähler, die man per Haken hinzufügt oder wegklickt. */
export const COUNTER_PRESETS = [
  { name: 'Inspiration', max: 1 },
  { name: 'Heiltränke', max: 2 },
  { name: 'Kampfrausch', max: 2 },
  { name: 'Ki-Punkte', max: 2 },
  { name: 'Zweiter Wind', max: 1 },
  { name: 'Tatendrang', max: 1 },
  { name: 'Bardische Inspiration', max: 3 },
  { name: 'Göttliche Macht fokussieren', max: 1 },
  { name: 'Handauflegen (HP-Vorrat)', max: 5 },
  { name: 'Zaubereipunkte', max: 2 },
  { name: 'Tiergestalt', max: 2 },
  { name: 'Erschöpfung (Stufe 0–6)', max: 6, cur: 0 },
  { name: 'Munition', max: 20 },
];

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
      data.id, data.portraitAssetId, (data.stats || []).map((s) => s.id), (data.counters || []).map((c) => c.id),
      (data.conditions || []).map((c) => c.id), data.hp.cur <= 0, !!data.dead, data.deathSaves,
      (data.slots || []).map((s) => s.max), (data.slots || []).some((s) => s.used), (this.opts.actions || []).map((a) => a.label),
      data.sheetPrefs,
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
      }, portraitUrl ? h('img', { src: portraitUrl, alt: '' }) : h('span', {}, initials(d.name))),
      h('input.name', { 'data-bind': 'name', value: d.name, 'aria-label': 'Name', onchange: (e) => this.patch({ name: e.target.value }) }),
      ...(o.actions || []).map((a) => h('button.small', { onclick: a.onClick, title: a.title || '' }, a.label)),
      h('button.small', { title: 'Zauberplätze und Zähler ein- oder ausblenden, Zähler-Vorlagen', onclick: () => this.customize() }, '⚙ Bogen anpassen')));
    const prefs = d.sheetPrefs || { slots: true, counters: true };

    // HP
    const hpNum = (key, label) => h('label.num', {}, h('span', {}, label),
      h('input', { type: 'number', min: 0, 'data-bind': `hp:${key}`, value: d.hp[key], inputmode: 'numeric',
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
      h('h4', {}, 'Trefferpunkte ', info('hp')),
      h('div.hpbar', {}, h('div', { style: { width: `${this.hpRatio() * 100}%` } })),
      h('div.row', {}, hpNum('cur', 'Aktuell'), hpNum('max', 'Maximum'), h('div.with-info', {}, hpNum('temp', 'Temporär'), info('tempHp'))),
      h('div.row', {}, amount,
        h('button.danger.small', { onclick: () => apply(-1) }, 'Schaden'),
        h('button.good.small', { onclick: () => apply(1) }, 'Heilung'))));

    // Am Boden: Todesrettungswürfe (P4) und für NPCs "tot oder am Boden" (P5)
    if (d.hp.cur <= 0) {
      const ds = d.deathSaves || { success: 0, fail: 0 };
      const row = (key, label, cls) => h('div.saves', {}, h('span', {}, label),
        ...[1, 2, 3].map((i) => h(`button.save${i <= ds[key] ? `.${cls}` : ''}`, {
          title: `${label} ${i}`,
          onclick: () => { this.patch({ deathSaves: { ...this.data.deathSaves, [key]: i <= this.data.deathSaves[key] ? i - 1 : i } }); this.signature = ''; this.render(); },
        })));
      c.append(h('section.down', {},
        h('h4', {}, o.kind === 'npc' ? (d.dead ? 'Tot' : 'Am Boden (bewusstlos)') : 'Am Boden: Todesrettungswürfe', ' ', info('deathSaves')),
        o.kind === 'npc' ? h('div.row', {},
          h(`button.small${d.dead ? '' : '.primary'}`, { onclick: () => { this.patch({ dead: false }); } }, 'Am Boden'),
          h(`button.small${d.dead ? '.danger' : ''}`, { onclick: () => { this.patch({ dead: true }); } }, 'Tot'),
          h('span.hint', {}, 'Spieler sehen „am Boden“ oder „tot“.')) : null,
        row('success', 'Erfolge', 'ok'), row('fail', 'Fehlschläge', 'bad')));
    }

    // Zustände (P4)
    c.append(h('section', {},
      h('h4', {}, 'Zustände ', h('button.small', { onclick: async () => {
        const list = await editConditions(this.data.conditions || [], `Zustände: ${this.data.name}`);
        if (list) this.opts.onConditions ? this.opts.onConditions(list) : null;
      } }, 'Ändern')),
      (d.conditions || []).length
        ? conditionChips(d.conditions, (cnd) => this.opts.onConditions?.(this.data.conditions.filter((x) => x.id !== cnd.id)))
        : h('p.hint', {}, 'Keine.')));

    // Weitere Werte (C7)
    const stats = h('div.stats');
    for (const s of d.stats) {
      stats.append(h('div.stat', {},
        h('input.label', { value: s.label, 'data-bind': `stat:${s.id}:label`, placeholder: 'Wert', onchange: (e) => this.editStat(s.id, { label: e.target.value }) }),
        h('input.value', { value: s.value, 'data-bind': `stat:${s.id}:value`, placeholder: '–', onchange: (e) => this.editStat(s.id, { value: e.target.value }) }),
        h('button.icon', { title: 'Entfernen', onclick: () => this.patch({ stats: this.data.stats.filter((x) => x.id !== s.id) }) }, '×')));
    }
    c.append(h('section', {},
      h('h4', {}, 'Werte ', info('ac'), h('button.small', { onclick: () => this.patch({ stats: [...this.data.stats, { id: uid('s_'), label: '', value: '' }] }) }, '+ Wert')),
      stats));

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
          h('span.lvl', {}, `Grad ${ROMAN[sl.level - 1]}`),
          editing ? h('input.max', { type: 'number', min: 0, max: 99, value: sl.max, 'data-bind': `slotmax:${sl.level}`, title: `Anzahl Plätze Grad ${ROMAN[sl.level - 1]}`,
            onchange: (e) => this.editSlot(sl.level, { max: Number(e.target.value) || 0 }) }) : null,
          boxes));
      }
      if (!slots.childElementCount) slots.append(h('p.hint', {}, 'Keine Zauberplätze. Mit „Anzahl ändern“ einrichten oder unter „Bogen anpassen“ ausblenden.'));
      c.append(h('section', {},
        h('h4', {}, 'Zauberplätze ', info('spellSlots'),
          h('button.small', { onclick: () => { this.editSlots = !editing; this.render(); } }, editing ? 'Fertig' : 'Anzahl ändern'),
          d.slots.some((s) => s.used) ? h('button.small', { title: 'Alle Plätze wieder frei (z. B. nach einer langen Rast)', onclick: () => {
            this.patch({ slots: this.data.slots.map((s) => ({ ...s, used: 0 })) }); this.refreshValues();
          } }, 'Alle frei') : null),
        slots));
    }

    // Zähler (C4)
    if (prefs.counters) {
      const counters = h('div.counters');
      for (const k of d.counters) {
        counters.append(h('div.counter', {},
          h('input.label', { value: k.name, placeholder: 'z. B. Ki-Punkte', 'data-bind': `counter:${k.id}:name`, onchange: (e) => this.editCounter(k.id, { name: e.target.value }) }),
          h('button.small', { onclick: () => this.editCounter(k.id, { cur: Math.max(0, this.read(`counter:${k.id}:cur`) - 1) }) }, '−'),
          h('input.cur', { type: 'number', min: 0, value: k.cur, 'data-bind': `counter:${k.id}:cur`, onchange: (e) => this.editCounter(k.id, { cur: Number(e.target.value) || 0 }) }),
          h('span', {}, '/'),
          h('input.cur', { type: 'number', min: 0, value: k.max, 'data-bind': `counter:${k.id}:max`, title: 'Höchstwert', onchange: (e) => this.editCounter(k.id, { max: Number(e.target.value) || 0 }) }),
          h('button.small', { onclick: () => this.editCounter(k.id, { cur: Math.min(this.read(`counter:${k.id}:max`), this.read(`counter:${k.id}:cur`) + 1) }) }, '+'),
          h('button.icon', { title: 'Entfernen', onclick: () => this.patch({ counters: this.data.counters.filter((x) => x.id !== k.id) }) }, '×')));
      }
      c.append(h('section', {},
        h('h4', {}, 'Zähler ', info('counters'), h('button.small', { onclick: () => this.patch({ counters: [...this.data.counters, { id: uid('k_'), name: '', cur: 0, max: 1 }] }) }, '+ Zähler')),
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
  }

  renderSlotBoxes(el, level) {
    const sl = this.data.slots.find((s) => s.level === level);
    if (!sl) return;
    if (el.childElementCount === sl.max && [...el.children].every((b, i) => b.classList.contains('used') === i < sl.used)) return;
    el.replaceChildren(...Array.from({ length: sl.max }, (_, i) => h(`button.diamond${i < sl.used ? '.used' : ''}`, {
      title: `Grad ${ROMAN[level - 1]}: ${i < sl.used ? 'verbraucht (antippen = wieder frei)' : 'frei (antippen = verbraucht)'}`,
      'aria-label': `Zauberplatz Grad ${ROMAN[level - 1]} ${i < sl.used ? 'verbraucht' : 'frei'}`,
      onclick: () => this.editSlot(level, { used: i < sl.used ? i : i + 1 }),
    }, h('span', {}, ROMAN[level - 1]))));
  }

  /** Bogen anpassen: Bereiche ein-/ausblenden, Zähler-Vorlagen an- oder abhaken. */
  async customize() {
    const d = this.data;
    const prefs = d.sheetPrefs || { slots: true, counters: true };
    const present = new Set(d.counters.map((k) => k.name));
    const r = await dialog({
      title: `Bogen anpassen: ${d.name}`,
      body: 'Wer keine Zauber wirkt (z. B. ein Krieger), blendet die Zauberplätze einfach aus. Vorlagen lassen sich jederzeit an- und abhaken.',
      fields: [
        { name: 'slots', label: 'Zauberplätze anzeigen', type: 'checkbox', value: prefs.slots },
        { name: 'counters', label: 'Zähler anzeigen', type: 'checkbox', value: prefs.counters },
        { name: 'presets', label: 'Zähler-Vorlagen', type: 'checks', value: COUNTER_PRESETS.filter((p) => present.has(p.name)).map((p) => p.name),
          options: COUNTER_PRESETS.map((p) => ({ value: p.name, label: `${p.name} (${p.max})` })) },
      ],
      okText: 'Übernehmen',
    });
    if (!r) return;
    const wanted = new Set(r.presets);
    const presetNames = new Set(COUNTER_PRESETS.map((p) => p.name));
    const counters = d.counters.filter((k) => !presetNames.has(k.name) || wanted.has(k.name));
    for (const p of COUNTER_PRESETS) {
      if (wanted.has(p.name) && !present.has(p.name)) counters.push({ id: uid('k_'), name: p.name, max: p.max, cur: p.cur ?? p.max });
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
      n.used = Math.min(n.used, n.max);
      return n;
    }) });
    this.refreshValues();
  }
}
