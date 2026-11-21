// Digitaler Charakterbogen (optional, eigener Reiter): Attribute mit Modifikator, Stufe,
// Übungsbonus, Rettungswürfe, alle 18 Fertigkeiten mit Übung/Expertise, passive Wahrnehmung,
// Angaben zur Person. Gerechnet wird nach den Regeln von 2014 (SRD 5.1).
// Übung/Expertise lassen sich nur nach „✎ Bearbeiten“ umschalten (Schutz gegen Antippen).

import { h } from './util.js';
import { info } from './help.js';
import { lockButton, applyLocks } from './lock.js';

export const ABILITIES = [
  { key: 'str', label: 'Stärke', short: 'STÄ' },
  { key: 'dex', label: 'Geschicklichkeit', short: 'GES' },
  { key: 'con', label: 'Konstitution', short: 'KON' },
  { key: 'int', label: 'Intelligenz', short: 'INT' },
  { key: 'wis', label: 'Weisheit', short: 'WEI' },
  { key: 'cha', label: 'Charisma', short: 'CHA' },
];

export const SKILLS = [
  { key: 'acrobatics', label: 'Akrobatik', ab: 'dex' },
  { key: 'arcana', label: 'Arkane Kunde', ab: 'int' },
  { key: 'athletics', label: 'Athletik', ab: 'str' },
  { key: 'performance', label: 'Auftreten', ab: 'cha' },
  { key: 'intimidation', label: 'Einschüchtern', ab: 'cha' },
  { key: 'sleightOfHand', label: 'Fingerfertigkeit', ab: 'dex' },
  { key: 'history', label: 'Geschichte', ab: 'int' },
  { key: 'medicine', label: 'Heilkunde', ab: 'wis' },
  { key: 'stealth', label: 'Heimlichkeit', ab: 'dex' },
  { key: 'animalHandling', label: 'Mit Tieren umgehen', ab: 'wis' },
  { key: 'insight', label: 'Motiv erkennen', ab: 'wis' },
  { key: 'investigation', label: 'Nachforschungen', ab: 'int' },
  { key: 'nature', label: 'Naturkunde', ab: 'int' },
  { key: 'religion', label: 'Religion', ab: 'int' },
  { key: 'deception', label: 'Täuschen', ab: 'cha' },
  { key: 'survival', label: 'Überlebenskunst', ab: 'wis' },
  { key: 'persuasion', label: 'Überzeugen', ab: 'cha' },
  { key: 'perception', label: 'Wahrnehmung', ab: 'wis' },
];

const SIZES = ['', 'Winzig', 'Klein', 'Mittelgroß', 'Groß', 'Riesig', 'Gigantisch'];
const ALIGNMENTS = ['', 'Rechtschaffen gut', 'Neutral gut', 'Chaotisch gut', 'Rechtschaffen neutral', 'Neutral', 'Chaotisch neutral',
  'Rechtschaffen böse', 'Neutral böse', 'Chaotisch böse', 'Ohne Gesinnung'];

/** Regeln 2014 */
export const modifier = (score) => Math.floor((Number(score) - 10) / 2);
export const proficiencyBonus = (level) => 2 + Math.floor((Math.max(1, Math.min(20, Number(level) || 1)) - 1) / 4);
export const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export function skillBonus(c, skill) {
  const s = SKILLS.find((x) => x.key === skill);
  return modifier(c.abilities[s.ab]) + (c.skills[skill] || 0) * proficiencyBonus(c.level);
}

export class AbilitySheet {
  /** opts: { onPatch(patch) } */
  constructor(container, opts) {
    this.container = container;
    this.opts = opts;
    this.sig = '';
  }

  focusedInside() {
    const a = document.activeElement;
    return this.container.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName);
  }

  update(c) {
    this.data = JSON.parse(JSON.stringify(c));
    const sig = JSON.stringify([c.id, c.level, c.abilities, c.saveProf, c.skills, c.personal]);
    if (sig === this.sig || this.focusedInside()) return;
    this.sig = sig;
    this.render();
  }

  patch(p) {
    for (const [k, v] of Object.entries(p)) {
      this.data[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...this.data[k], ...v } : v;
    }
    this.opts.onPatch(p);
    this.sig = '';
    if (!this.focusedInside()) this.render();
  }

  render() {
    const c = this.data;
    if (!c.abilities) { this.container.replaceChildren(h('p.hint', {}, 'Lädt …')); return; }
    const pb = proficiencyBonus(c.level);
    const perception = 10 + skillBonus(c, 'perception');
    const box = (label, value, key) => h('div.cs-box', {}, h('small', {}, label, key ? info(key) : null), h('b', {}, value));

    const abilities = h('div.cs-abilities', {}, ...ABILITIES.map((a) => {
      const score = c.abilities[a.key];
      const save = modifier(score) + (c.saveProf[a.key] ? pb : 0);
      return h('div.cs-ability', {},
        h('div.cs-ab-name', { title: a.label }, a.label),
        h('div.cs-mod', { title: 'Modifikator (automatisch)' }, signed(modifier(score))),
        h('input.cs-score', { type: 'number', min: 1, max: 30, inputmode: 'numeric', value: score, 'data-lock': '', 'aria-label': `${a.label}-Wert`,
          onchange: (e) => this.patch({ abilities: { [a.key]: Math.max(1, Math.min(30, Number(e.target.value) || 10)) } }) }),
        h('label.cs-save', { title: 'In diesem Rettungswurf geübt?' },
          h('input', { type: 'checkbox', checked: !!c.saveProf[a.key], 'data-lock': '', onchange: (e) => this.patch({ saveProf: { [a.key]: e.target.checked } }) }),
          h('span', {}, 'Rettung'), h('b', {}, signed(save))));
    }));

    const dot = (skill, level, title) => {
      const on = (c.skills[skill] || 0) >= level;
      return h(`button.cs-dot${on ? '.on' : ''}${level === 2 ? '.exp' : ''}`, {
        type: 'button', title, 'data-lock': '', 'aria-pressed': on ? 'true' : 'false',
        onclick: () => {
          const cur = c.skills[skill] || 0;
          // Ü an/aus; E nur zusammen mit Ü
          const next = level === 1 ? (cur >= 1 ? 0 : 1) : (cur === 2 ? 1 : 2);
          this.patch({ skills: { [skill]: next } });
        },
      }, level === 1 ? 'Ü' : 'E');
    };
    const skills = h('div.cs-skills', {}, ...SKILLS.map((s) => h(`div.cs-skill${c.skills[s.key] ? '.trained' : ''}`, {},
      dot(s.key, 1, `${s.label}: geübt (Übungsbonus +${pb})`),
      dot(s.key, 2, `${s.label}: Expertise (doppelter Übungsbonus +${pb * 2})`),
      h('span.cs-skill-name', {}, s.label, ' ', h('small', {}, ABILITIES.find((a) => a.key === s.ab).short)),
      h('b.cs-skill-val', {}, signed(skillBonus(c, s.key))))));

    const personal = (key, label, opts = {}) => h('label.field.cs-pers', {}, h('span', {}, label, opts.info ? info(opts.info) : null),
      opts.options
        ? h('select', { 'data-lock': '', onchange: (e) => this.patch({ personal: { [key]: e.target.value } }) },
          ...opts.options.map((o) => h('option', { value: o, selected: (c.personal[key] || '') === o }, o || '–')),
          c.personal[key] && !opts.options.includes(c.personal[key]) ? h('option', { value: c.personal[key], selected: true }, c.personal[key]) : null)
        : h('input', { value: c.personal[key] || '', placeholder: opts.placeholder || '', 'data-lock': '', onchange: (e) => this.patch({ personal: { [key]: e.target.value } }) }));

    this.container.replaceChildren(h('div.charsheet', {},
      h('div.section-head', {}, h('h3', {}, 'Attribute und Fertigkeiten'), lockButton()),
      h('p.hint', {}, 'Optional. Werte eintragen, den Rest rechnet die App nach den Regeln von 2014. Zum Ändern „✎ Bearbeiten“ antippen.'),
      h('div.cs-top', {},
        h('label.cs-box', {}, h('small', {}, 'Stufe', info('level')),
          h('input.cs-level', { type: 'number', min: 1, max: 20, inputmode: 'numeric', value: c.level, 'data-lock': '',
            onchange: (e) => this.patch({ level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }) })),
        box('Übungsbonus', signed(pb), 'proficiency'),
        box('Initiative', signed(modifier(c.abilities.dex)), 'initiative'),
        box('Passive Wahrnehmung', String(perception), 'passivePerception')),
      h('h4', {}, 'Attribute ', info('abilities'), ' · Rettungswürfe ', info('saves')),
      abilities,
      h('h4', {}, 'Fertigkeiten ', info('skills')),
      h('p.hint', {}, 'Ü = geübt, E = Expertise (doppelter Übungsbonus).'),
      skills,
      h('h4', {}, 'Angaben'),
      h('div.cs-personal', {},
        personal('age', 'Alter', { placeholder: 'z. B. 27' }),
        personal('gender', 'Geschlecht'),
        personal('faith', 'Glaube', { placeholder: 'z. B. Tymora' }),
        personal('height', 'Größe', { placeholder: 'z. B. 1,75 m' }),
        personal('size', 'Kategorie', { options: SIZES, info: 'size' }),
        personal('weight', 'Gewicht', { placeholder: 'z. B. 70 kg' }),
        personal('alignment', 'Gesinnung', { options: ALIGNMENTS, info: 'alignment' }))));
    applyLocks(this.container);
  }
}
