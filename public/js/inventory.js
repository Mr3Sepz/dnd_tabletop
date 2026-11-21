// Inventar eines Charakters (C5): oben Waffen und vorbereitete Zauber (mit Munitionszähler),
// darunter Münzen und Gegenstände. Ändern dürfen der Spieler selbst und der DM.
// Der DM kann den Münzen für alle eigene Namen geben (⚙ bei „Münzen“).

import { h, debounce, dialog } from './util.js';
import { info } from './help.js';
import { lockButton, applyLocks } from './lock.js';

export const COINS = [
  { key: 'pp', label: 'Platin', short: 'PM', cls: 'pp' },
  { key: 'gp', label: 'Gold', short: 'GM', cls: 'gp' },
  { key: 'sp', label: 'Silber', short: 'SM', cls: 'sp' },
  { key: 'cp', label: 'Kupfer', short: 'KM', cls: 'cp' },
];

/** Münzname mit Anpassung des DM. */
export function coinLabel(c, names) {
  const n = names && names[c.key];
  return n ? { label: n, short: n.slice(0, 2).toUpperCase() } : { label: c.label, short: c.short };
}

const uid = (p) => p + Math.random().toString(36).slice(2, 10);

export class InventoryEditor {
  /**
   * opts: { onPatch(patch), isDM, coinNames(): {pp,gp,sp,cp}, onCoinNames(names) }
   * onPatch schickt { coins }, { inventory }, { weapons } oder { spells } an den Server.
   */
  constructor(container, opts) {
    this.container = container;
    this.opts = opts;
    this.onPatch = opts.onPatch;
    this.id = null;
    this.data = null;
    this.signature = '';
  }

  focusedInside() {
    const a = document.activeElement;
    return this.container.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
  }

  update(character) {
    this.data = JSON.parse(JSON.stringify(character));
    const sig = JSON.stringify([character.id, (character.weapons || []).map((w) => [w.id, !!w.ammo]), (character.spells || []).map((w) => w.id),
      this.opts.coinNames ? this.opts.coinNames() : null]);
    if ((sig !== this.signature && !this.focusedInside()) || !this.container.firstChild) {
      this.signature = sig; this.id = character.id; this.render(); return;
    }
    for (const el of this.container.querySelectorAll('[data-coin]')) {
      if (el !== document.activeElement) el.value = this.data.coins?.[el.dataset.coin] ?? 0;
    }
    for (const el of this.container.querySelectorAll('[data-gear]')) {
      if (el === document.activeElement) continue;
      const [list, id, key, sub] = el.dataset.gear.split(':');
      const item = (this.data[list] || []).find((x) => x.id === id);
      if (!item) continue;
      const v = sub ? item[key]?.[sub] : item[key];
      if (v !== undefined && el.value !== String(v)) el.value = v;
    }
    const ta = this.container.querySelector('textarea.items');
    if (ta && ta !== document.activeElement && ta.value !== (this.data.inventory || '')) ta.value = this.data.inventory || '';
  }

  setCoin(key, value) {
    const coins = { ...(this.data.coins || {}), [key]: Math.max(0, Math.round(Number(value) || 0)) };
    this.data.coins = coins;
    this.onPatch({ coins });
    this.update(this.data);
  }

  patchList(list, items) {
    this.data[list] = items;
    this.onPatch({ [list]: items });
  }
  editItem(list, id, p) {
    this.patchList(list, (this.data[list] || []).map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  setAmmo(id, cur) {
    const w = this.data.weapons.find((x) => x.id === id);
    if (!w || !w.ammo) return;
    this.editItem('weapons', id, { ammo: { ...w.ammo, cur: Math.max(0, Math.min(w.ammo.max, cur)) } });
    this.update(this.data);
  }

  async editCoinNames() {
    const names = this.opts.coinNames() || {};
    const r = await dialog({
      title: 'Münznamen für alle',
      body: 'Eigene Namen für deine Welt, z. B. „Kronen“ statt Gold. Leer lassen = Standardname. Die Spieler sehen die Namen, ändern können sie sie nicht.',
      fields: COINS.map((c) => ({ name: c.key, label: c.label, value: names[c.key] || '', placeholder: c.label })),
      okText: 'Übernehmen',
    });
    if (r) this.opts.onCoinNames(r);
  }

  render() {
    const d = this.data;
    const coins = d.coins || { pp: 0, gp: 0, sp: 0, cp: 0 };
    const names = this.opts.coinNames ? this.opts.coinNames() : null;
    const commit = debounce((v) => this.onPatch({ inventory: v }), 600);
    const field = (list, item, key, label, opts = {}) => h('label.gear-field', { style: opts.grow ? { flex: opts.grow } : {} },
      h('span', {}, label, opts.info ? info(opts.info) : null),
      h('input', { value: item[key] || '', placeholder: opts.placeholder || '', 'data-lock': '', 'data-gear': `${list}:${item.id}:${key}`,
        onchange: (e) => this.editItem(list, item.id, { [key]: e.target.value }) }));

    const weapons = (d.weapons || []).map((w) => h('div.gear', {},
      h('div.gear-row', {},
        field('weapons', w, 'name', 'Name', { grow: 3, placeholder: 'z. B. Langbogen' }),
        field('weapons', w, 'attack', 'Angr. Bonus', { grow: 1, placeholder: '+5', info: 'attackBonus' }),
        field('weapons', w, 'damage', 'Schaden/Art', { grow: 2, placeholder: '1W8+3 Stich' }),
        h('button.icon', { title: 'Waffe entfernen', 'data-lock': '', onclick: () => { this.patchList('weapons', d.weapons.filter((x) => x.id !== w.id)); this.signature = ''; } }, '×')),
      w.ammo
        ? h('div.ammo', {},
          h('span', {}, '🏹 ', w.ammo.name || 'Munition'),
          h('button.small', { title: 'Einen verschießen', onclick: () => this.setAmmo(w.id, (this.data.weapons.find((x) => x.id === w.id)?.ammo?.cur || 0) - 1) }, '−'),
          h('input.cur', { type: 'number', min: 0, value: w.ammo.cur, 'data-lock': '', 'data-gear': `weapons:${w.id}:ammo:cur`, onchange: (e) => this.setAmmo(w.id, Number(e.target.value) || 0) }),
          h('span', {}, '/'),
          h('input.cur', { type: 'number', min: 0, value: w.ammo.max, title: 'Höchstwert', 'data-lock': '', 'data-gear': `weapons:${w.id}:ammo:max`,
            onchange: (e) => { const max = Math.max(0, Number(e.target.value) || 0); this.editItem('weapons', w.id, { ammo: { ...w.ammo, max, cur: Math.min(w.ammo.cur, max) } }); } }),
          h('button.small', { title: 'Einen aufsammeln', onclick: () => this.setAmmo(w.id, (this.data.weapons.find((x) => x.id === w.id)?.ammo?.cur || 0) + 1) }, '+'),
          h('button.icon', { title: 'Munitionszähler entfernen', 'data-lock': '', onclick: () => this.editItem('weapons', w.id, { ammo: null }) }, '×'))
        : h('button.small.link-like', { 'data-lock': '', onclick: async () => {
          const r = await dialog({ title: 'Munitionszähler', fields: [
            { name: 'name', label: 'Was wird gezählt?', value: /armbrust/i.test(w.name) ? 'Bolzen' : 'Pfeile' },
            { name: 'max', label: 'Anzahl', type: 'number', min: 0, value: 20 }], okText: 'Hinzufügen' });
          if (r) this.editItem('weapons', w.id, { ammo: { name: r.name, max: r.max || 0, cur: r.max || 0 } });
        } }, '+ Munitionszähler')));

    const spells = (d.spells || []).map((sp) => h('div.gear', {},
      h('div.gear-row', {},
        field('spells', sp, 'name', 'Name', { grow: 3, placeholder: 'z. B. Feuerpfeil' }),
        field('spells', sp, 'attack', 'Angr. Bonus', { grow: 1, placeholder: '+5 / SG 13', info: 'attackBonus' }),
        field('spells', sp, 'damage', 'Schaden/Art', { grow: 2, placeholder: '1W10 Feuer' }),
        field('spells', sp, 'range', 'Reichweite', { grow: 1.5, placeholder: '36 m' }),
        h('button.icon', { title: 'Zauber entfernen', 'data-lock': '', onclick: () => { this.patchList('spells', d.spells.filter((x) => x.id !== sp.id)); this.signature = ''; } }, '×'))));

    this.container.replaceChildren(
      h('section.gear-list', {},
        h('h4', {}, 'Aktuelle Waffen ', lockButton(),
          h('button.small', { 'data-lock': '', onclick: () => this.patchList('weapons', [...(d.weapons || []), { id: uid('wa_'), name: '', attack: '', damage: '', ammo: null }]) }, '+ Waffe')),
        weapons.length ? weapons : h('p.hint', {}, 'Noch keine. „✎ Bearbeiten“, dann „+ Waffe“.'),
        h('h4', {}, 'Vorbereitete Zauber ',
          h('button.small', { 'data-lock': '', onclick: () => this.patchList('spells', [...(d.spells || []), { id: uid('sp_'), name: '', attack: '', damage: '', range: '' }]) }, '+ Zauber')),
        spells.length ? spells : h('p.hint', {}, 'Keine.')),
      h('section.inventory', {},
        h('h4', {}, 'Münzen ', info('coins'),
          this.opts.isDM ? h('button.icon', { title: 'Münznamen für alle ändern', onclick: () => this.editCoinNames() }, '⚙') : null),
        h('div.coins', {}, ...COINS.map((c) => {
          const n = coinLabel(c, names);
          return h(`div.coin.${c.cls}`, {},
            h('span.coin-dot', { title: n.label }, n.short),
            h('label', {}, h('span', {}, n.label),
              h('input', { type: 'number', min: 0, inputmode: 'numeric', value: coins[c.key] ?? 0, 'data-coin': c.key,
                onchange: (e) => this.setCoin(c.key, e.target.value) })),
            h('div.coin-btns', {},
              h('button.small', { title: `1 ${n.label} weniger`, onclick: () => this.setCoin(c.key, (this.data.coins?.[c.key] || 0) - 1) }, '−'),
              h('button.small', { title: `1 ${n.label} mehr`, onclick: () => this.setCoin(c.key, (this.data.coins?.[c.key] || 0) + 1) }, '+')));
        })),
        h('h4', {}, 'Gegenstände'),
        h('textarea.items', { rows: 12, placeholder: 'Ein Gegenstand pro Zeile, z. B.\nSeil (15 m)\nHeiltrank ×2\nKarte von Phandalin',
          oninput: (e) => commit(e.target.value), onblur: (e) => this.onPatch({ inventory: e.target.value }) }, d.inventory || '')));
    applyLocks(this.container);
  }
}
