// Zustände auswählen (Vorschlag 3): feste 5e-Liste plus freie Einträge wie "Segen".

import { h, dialog, CATALOG } from './util.js';

/** Öffnet den Auswahldialog. Gibt die neue Liste zurück oder null bei Abbruch. */
export async function editConditions(current = [], title = 'Zustände') {
  const custom = current.filter((c) => c.key === 'custom');
  const res = await dialog({
    title,
    fields: [
      { name: 'keys', label: 'Zustände', type: 'checks', value: current.filter((c) => c.key !== 'custom').map((c) => c.key),
        options: CATALOG.conditions.map((c) => ({ value: c.key, label: c.label, color: c.color })) },
      { name: 'customLabel', label: 'Eigener Zustand (optional), z. B. „Schläft (Sleep)“', value: '' },
      { name: 'customColor', label: 'Farbe dafür', type: 'color', value: '#888888' },
      ...(custom.length ? [{ name: 'keepCustom', label: 'Eigene behalten', type: 'checks', value: custom.map((c) => c.id),
        options: custom.map((c) => ({ value: c.id, label: c.label, color: c.color })) }] : []),
    ],
    okText: 'Übernehmen',
  });
  if (!res) return null;
  const list = res.keys.map((key) => ({ key }));
  for (const c of custom) if ((res.keepCustom || []).includes(c.id)) list.push(c);
  if (res.customLabel.trim()) list.push({ key: 'custom', label: res.customLabel.trim(), color: res.customColor });
  return list;
}

/** Kleine farbige Chips zur Anzeige. */
export function conditionChips(list = [], onRemove) {
  return h('div.chips', {}, ...list.map((c) => h('span.chip', { style: { borderColor: c.color } },
    h('span.swatch', { style: { background: c.color } }), c.label,
    onRemove ? h('button.icon.chip-x', { title: 'Entfernen', onclick: () => onRemove(c) }, '×') : null)));
}
