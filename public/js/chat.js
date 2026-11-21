// Kleiner Direktchat: an alle, an den DM, an einzelne oder mehrere Spieler.
// Der Server schickt jede Nachricht nur an Absender und Empfänger und speichert sie nicht im
// Spielstand. Was nicht an den DM geht, kann der DM also nicht lesen.

import { h, toast } from './util.js';

export class ChatPanel {
  /** opts: { me: 'dm' | Platznummer, conn, people(): [{ id, label }] (ohne mich) } */
  constructor(opts) {
    this.opts = opts;
    this.messages = [];
    this.to = 'all';
    this.unread = 0;
    this.button = h('button.chat-toggle', { title: 'Chat', onclick: () => this.toggle() }, '💬', this.badge = h('span.badge.hidden'));
    this.panel = h('div.chat-panel.hidden');
    document.body.append(this.button, this.panel);
    this.render();
  }

  isOpen() { return !this.panel.classList.contains('hidden'); }

  toggle(force) {
    const open = force ?? !this.isOpen();
    this.panel.classList.toggle('hidden', !open);
    if (open) { this.unread = 0; this.renderBadge(); this.render(); this.input?.focus(); }
  }

  setHistory(list) { this.messages = list || []; this.render(); }

  receive(m) {
    if (this.messages.some((x) => x.id === m.id)) return;
    this.messages.push(m);
    if (this.messages.length > 300) this.messages.shift();
    if (!this.isOpen() && m.from !== this.opts.me) {
      this.unread += 1;
      this.renderBadge();
      toast(`💬 ${m.name}${m.to === 'all' ? '' : ' (an dich)'}: ${m.text.slice(0, 80)}`);
    }
    this.renderList();
  }

  renderBadge() {
    this.badge.textContent = String(this.unread);
    this.badge.classList.toggle('hidden', !this.unread);
  }

  label(id) {
    if (id === 'dm') return 'DM';
    if (id === this.opts.me) return 'mich';
    return this.opts.people().find((p) => p.id === id)?.label || `Platz ${id}`;
  }

  async send() {
    const text = this.input.value.trim();
    if (!text) return;
    if (this.to !== 'all' && !this.to.length) return toast('Bitte mindestens einen Empfänger wählen.', 'error');
    const r = await this.opts.conn.request('chat.send', { to: this.to, text });
    if (!r || !r.ok) return toast((r && r.error) || 'Nicht gesendet', 'error');
    this.input.value = '';
    this.receive(r.message);
  }

  render() {
    const people = this.opts.people();
    const isAll = this.to === 'all';
    const chip = (id, label) => {
      const on = !isAll && this.to.includes(id);
      return h(`button.chip${on ? '.on' : ''}`, { type: 'button', onclick: () => {
        const set = new Set(isAll ? [] : this.to);
        if (set.has(id)) set.delete(id); else set.add(id);
        this.to = set.size ? [...set] : 'all';
        this.render();
      } }, label);
    };
    this.listEl = h('ol.chat-log');
    this.input = h('input.chat-input', { placeholder: isAll ? 'Nachricht an alle …' : `Nachricht an ${this.to.map((x) => this.label(x)).join(', ')} …`,
      onkeydown: (e) => { if (e.key === 'Enter') this.send(); } });
    this.panel.replaceChildren(
      h('div.dice-head', {}, h('b', {}, 'Chat'), h('button.icon', { onclick: () => this.toggle(false), title: 'Schließen' }, '×')),
      this.listEl,
      h('div.chat-to', {}, h('span', {}, 'An:'),
        h(`button.chip${isAll ? '.on' : ''}`, { type: 'button', onclick: () => { this.to = 'all'; this.render(); } }, 'Alle'),
        ...people.map((p) => chip(p.id, p.label))),
      h('div.row', {}, this.input, h('button.small.primary', { onclick: () => this.send() }, 'Senden')),
      h('p.hint', {}, this.opts.me === 'dm'
        ? 'Nachrichten zwischen Spielern siehst du nicht. Gespeichert wird der Chat nicht.'
        : 'Der DM sieht nur, was an alle oder an ihn geht. Gespeichert wird der Chat nicht.'));
    this.renderList();
  }

  renderList() {
    if (!this.listEl || !this.isOpen()) return;
    const me = this.opts.me;
    this.listEl.replaceChildren(...this.messages.slice(-100).map((m) => h(`li${m.from === me ? '.mine' : ''}${m.to !== 'all' ? '.direct' : ''}`, {},
      h('div.chat-meta', {},
        h('b', {}, m.from === me ? 'Ich' : m.name),
        h('span', {}, m.to === 'all' ? ' an alle' : ` an ${m.to.map((x) => this.label(x)).join(', ')}`),
        h('small', {}, ' · ', new Date(m.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }))),
      h('div.chat-text', {}, m.text))));
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }
}
