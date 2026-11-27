// Kleiner Chat mit getrennten Unterhaltungen (Tabs): „Alle“, je ein Tab pro Person
// und auf Wunsch Gruppen (z. B. DM + Tom + Mia). Geschrieben wird immer in den offenen
// Tab, so geht nichts aus Versehen an alle.
// Der Server schickt jede Nachricht nur an Absender und Empfänger und speichert sie nicht im
// Spielstand. Was nicht an den DM geht, kann der DM also nicht lesen.

import { icon } from './icons.js';
import { h, toast, dialog } from './util.js';

const keyOf = (ids) => ids.map(String).sort().join(',');

export class ChatPanel {
  /** opts: { me: 'dm' | Platznummer, conn, people(): [{ id, label }] (ohne mich) } */
  constructor(opts) {
    this.opts = opts;
    this.messages = [];
    this.active = 'all';
    this.groups = new Set(); // selbst angelegte Gruppen-Tabs
    this.unread = new Map();
    this.button = h('button.fab.chat-toggle', { title: 'Chat', 'aria-label': 'Chat', onclick: () => this.toggle() }, icon('chat', 26), this.badge = h('span.badge.hidden'));
    this.panel = h('div.chat-panel.hidden');
    document.body.append(this.button, this.panel);
    this.render();
  }

  isOpen() { return !this.panel.classList.contains('hidden'); }

  toggle(force) {
    const open = force ?? !this.isOpen();
    this.panel.classList.toggle('hidden', !open);
    if (open) { this.unread.delete(this.active); this.render(); this.input?.focus(); }
    this.renderBadge();
  }

  /** Unterhaltung einer Nachricht aus meiner Sicht: 'all' oder die anderen Beteiligten. */
  convOf(m) {
    if (m.to === 'all') return 'all';
    const me = String(this.opts.me);
    const ids = new Set([m.from, ...m.to].map(String));
    ids.delete(me);
    return keyOf([...ids]);
  }

  setHistory(list) { this.messages = list || []; this.render(); }

  receive(m) {
    if (this.messages.some((x) => x.id === m.id)) return;
    this.messages.push(m);
    if (this.messages.length > 300) this.messages.shift();
    const conv = this.convOf(m);
    if (conv.includes(',')) this.groups.add(conv);
    const mine = String(m.from) === String(this.opts.me);
    if (!mine && (!this.isOpen() || this.active !== conv)) {
      this.unread.set(conv, (this.unread.get(conv) || 0) + 1);
      if (!this.isOpen()) toast(`💬 ${m.name} → ${this.convLabel(conv)}: ${m.text.slice(0, 80)}`);
    }
    this.renderBadge();
    this.render();
  }

  renderBadge() {
    const n = [...this.unread.values()].reduce((a, b) => a + b, 0);
    this.badge.textContent = String(n);
    this.badge.classList.toggle('hidden', !n);
  }

  label(id) {
    if (String(id) === 'dm') return 'DM';
    return this.opts.people().find((p) => String(p.id) === String(id))?.label || `Platz ${id}`;
  }

  convLabel(conv) {
    if (conv === 'all') return 'Alle';
    return conv.split(',').map((x) => this.label(x)).join(' + ');
  }

  recipients(conv) {
    if (conv === 'all') return 'all';
    return conv.split(',').map((x) => (x === 'dm' ? 'dm' : Number(x)));
  }

  async send() {
    const text = this.input.value.trim();
    if (!text) return;
    const r = await this.opts.conn.request('chat.send', { to: this.recipients(this.active), text });
    if (!r || !r.ok) return toast((r && r.error) || 'Nicht gesendet', 'error');
    this.input.value = '';
    this.receive(r.message);
    this.input.focus();
  }

  async newGroup() {
    const people = this.opts.people();
    if (people.length < 2) return toast('Für eine Gruppe braucht es mindestens zwei andere.', 'error');
    const r = await dialog({ title: 'Neue Gruppe', body: 'Wer soll in dieser Unterhaltung mitlesen?',
      fields: [{ name: 'ids', label: 'Teilnehmer', type: 'checks', value: [], options: people.map((p) => ({ value: String(p.id), label: p.label })) }],
      okText: 'Anlegen' });
    if (!r || !r.ids.length) return;
    const conv = keyOf(r.ids);
    if (r.ids.length > 1) this.groups.add(conv);
    this.active = conv;
    this.toggle(true);
  }

  tabs() {
    const list = ['all', ...this.opts.people().map((p) => String(p.id))];
    for (const m of this.messages) { const c = this.convOf(m); if (!list.includes(c)) list.push(c); }
    for (const g of this.groups) if (!list.includes(g)) list.push(g);
    return list;
  }

  render() {
    const tabs = this.tabs();
    if (!tabs.includes(this.active)) this.active = 'all';
    this.unread.delete(this.isOpen() ? this.active : '');
    const conv = this.active;
    this.listEl = h('ol.chat-log');
    this.input = h('input.chat-input', { placeholder: conv === 'all' ? 'Nachricht an alle …' : `Nachricht an ${this.convLabel(conv)} …`,
      onkeydown: (e) => { if (e.key === 'Enter') this.send(); } });
    this.panel.replaceChildren(
      h('div.dice-head', {}, h('b', {}, 'Chat'), h('button.icon', { onclick: () => this.toggle(false), title: 'Schließen' }, '×')),
      h('div.chat-tabs', { role: 'tablist' },
        ...tabs.map((c) => {
          const n = this.unread.get(c) || 0;
          return h(`button.chat-tab${c === conv ? '.on' : ''}${c === 'all' ? '.all' : ''}`, {
            type: 'button', role: 'tab', title: c === 'all' ? 'Alle lesen mit' : `Nur ${this.convLabel(c)} und du`,
            onclick: () => { this.active = c; this.unread.delete(c); this.renderBadge(); this.render(); this.input.focus(); },
          }, c === 'all' ? '📢 Alle' : this.convLabel(c), n ? h('span.tab-badge', {}, String(n)) : null);
        }),
        h('button.chat-tab.add', { type: 'button', title: 'Unterhaltung mit mehreren Personen', onclick: () => this.newGroup() }, '+ Gruppe')),
      h(`div.chat-who${conv === 'all' ? '.all' : ''}`, {}, conv === 'all' ? 'Alle lesen mit' : `Nur ${this.convLabel(conv)} und du`),
      this.listEl,
      h('div.row', {}, this.input, h('button.small.primary', { onclick: () => this.send() }, 'Senden')),
      h('p.hint', {}, this.opts.me === 'dm'
        ? 'Nachrichten zwischen Spielern siehst du nicht. Gespeichert wird der Chat nicht.'
        : 'Der DM sieht nur, was an alle oder an ihn geht. Gespeichert wird der Chat nicht.'));
    this.renderList();
  }

  renderList() {
    if (!this.listEl) return;
    const me = String(this.opts.me);
    const msgs = this.messages.filter((m) => this.convOf(m) === this.active).slice(-100);
    this.listEl.replaceChildren(...(msgs.length ? msgs.map((m) => h(`li${String(m.from) === me ? '.mine' : ''}`, {},
      h('div.chat-meta', {},
        h('b', { 'data-raw': '' }, String(m.from) === me ? 'Ich' : m.name),
        h('small', {}, ' · ', new Date(m.ts).toLocaleTimeString(document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' }))),
      h('div.chat-text', { 'data-raw': '' }, m.text)))
      : [h('li.empty', {}, 'Noch keine Nachrichten.')]));
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }
}
