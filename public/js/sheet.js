// Charakterbogen für Spielercharaktere und NPCs:
// HP (C2), weitere Werte wie RK (C7), Zauberplätze (C3), Zähler (C4),
// Inventar (C5), Notizen (T3 bzw. NPC-Notiz).
//
// Damit beim Tippen nichts springt, wird der Bogen nur neu aufgebaut, wenn
// sich seine Struktur ändert und gerade kein Feld darin bearbeitet wird.
// Sonst werden nur die Werte der nicht fokussierten Felder aktualisiert.

import { h, debounce, assetUrl, initials } from './util.js';

const uid = (p) => p + Math.random().toString(36).slice(2, 10);

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
      (data.slots || []).map((s) => s.max), (data.slots || []).some((s) => s.used), (this.opts.actions || []).map((a) => a.label),
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
      ...(o.actions || []).map((a) => h('button.small', { onclick: a.onClick, title: a.title || '' }, a.label))));

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
      h('h4', {}, 'Trefferpunkte'),
      h('div.hpbar', {}, h('div', { style: { width: `${this.hpRatio() * 100}%` } })),
      h('div.row', {}, hpNum('cur', 'Aktuell'), hpNum('max', 'Maximum'), hpNum('temp', 'Temporär')),
      h('div.row', {}, amount,
        h('button.danger.small', { onclick: () => apply(-1) }, 'Schaden'),
        h('button.good.small', { onclick: () => apply(1) }, 'Heilung'))));

    // Weitere Werte (C7)
    const stats = h('div.stats');
    for (const s of d.stats) {
      stats.append(h('div.stat', {},
        h('input.label', { value: s.label, 'data-bind': `stat:${s.id}:label`, placeholder: 'Wert', onchange: (e) => this.editStat(s.id, { label: e.target.value }) }),
        h('input.value', { value: s.value, 'data-bind': `stat:${s.id}:value`, placeholder: '–', onchange: (e) => this.editStat(s.id, { value: e.target.value }) }),
        h('button.icon', { title: 'Entfernen', onclick: () => this.patch({ stats: this.data.stats.filter((x) => x.id !== s.id) }) }, '×')));
    }
    c.append(h('section', {},
      h('h4', {}, 'Werte ', h('button.small', { onclick: () => this.patch({ stats: [...this.data.stats, { id: uid('s_'), label: '', value: '' }] }) }, '+ Wert')),
      stats));

    // Zauberplätze (C3): Anzahl pro Grad von Hand einstellbar, verbrauchte abhaken.
    // Normal sieht man nur Grade mit Plätzen; "Anzahl ändern" zeigt alle 9.
    const editing = !!this.editSlots;
    const slots = h('div.slots');
    for (const sl of d.slots) {
      if (!editing && sl.max === 0) continue;
      const boxes = h('div.boxes', { dataset: { slotLevel: sl.level } });
      this.renderSlotBoxes(boxes, sl.level);
      slots.append(h('div.slot', {},
        h('span.lvl', {}, `${sl.level}.`),
        editing ? h('input.max', { type: 'number', min: 0, max: 99, value: sl.max, 'data-bind': `slotmax:${sl.level}`, title: `Anzahl Plätze ${sl.level}. Grad`,
          onchange: (e) => this.editSlot(sl.level, { max: Number(e.target.value) || 0 }) }) : null,
        boxes));
    }
    if (!slots.childElementCount) slots.append(h('p.hint', {}, 'Keine Zauberplätze. Mit „Anzahl ändern“ einrichten.'));
    c.append(h('section', {},
      h('h4', {}, 'Zauberplätze ',
        h('button.small', { onclick: () => { this.editSlots = !editing; this.render(); } }, editing ? 'Fertig' : 'Anzahl ändern'),
        d.slots.some((s) => s.used) ? h('button.small', { title: 'Alle Plätze wieder frei', onclick: () => {
          this.patch({ slots: this.data.slots.map((s) => ({ ...s, used: 0 })) }); this.refreshValues();
        } }, 'Alle frei') : null),
      slots,
      d.slots.some((s) => s.max) ? h('p.hint', {}, 'Gefülltes Kästchen = verbraucht. Antippen zum Ändern.') : null));

    // Zähler (C4)
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
      h('h4', {}, 'Zähler ', h('button.small', { onclick: () => this.patch({ counters: [...this.data.counters, { id: uid('k_'), name: '', cur: 0, max: 1 }] }) }, '+ Zähler')),
      counters));

    // Texte
    const textArea = (key, title, placeholder) => {
      const commit = debounce((v) => this.patch({ [key]: v }), 600);
      return h('section', {}, h('h4', {}, title),
        h('textarea', { rows: 6, 'data-bind': key, placeholder, oninput: (e) => commit(e.target.value), onblur: (e) => this.patch({ [key]: e.target.value }) }, d[key] || ''));
    };
    if (o.showInventory) c.append(textArea('inventory', 'Inventar', 'Ein Gegenstand pro Zeile …'));
    if (o.showPrivateNotes) c.append(textArea('privateNotes', 'Mein Notizbuch (nur für mich, auch der DM sieht es nicht)', 'Notizen …'));
    if (o.showNote) c.append(textArea('note', 'Notiz zu diesem NPC', 'Wer ist das? Was will er?'));
  }

  renderSlotBoxes(el, level) {
    const sl = this.data.slots.find((s) => s.level === level);
    if (!sl) return;
    if (el.childElementCount === sl.max && [...el.children].every((b, i) => b.classList.contains('used') === i < sl.used)) return;
    el.replaceChildren(...Array.from({ length: sl.max }, (_, i) => h(`button.box${i < sl.used ? '.used' : ''}`, {
      title: i < sl.used ? 'verbraucht' : 'frei',
      onclick: () => this.editSlot(level, { used: i < sl.used ? i : i + 1 }),
    })));
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
