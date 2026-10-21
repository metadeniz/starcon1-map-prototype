import type { Faction, ScenarioConfig, WorldCounts } from '../model/types';
import { SHIP_ROSTER } from '../model/shipRoster';
import { MAX_STARTING_SHIPS } from '../generation/scenarioBuilder';

const SIDES: { faction: Faction; label: string }[] = [
  { faction: 'hierarchy', label: 'Hierarchy' },
  { faction: 'alliance', label: 'Alliance' },
];

const WORLD_ROWS: { key: keyof WorldCounts; label: string }[] = [
  { key: 'dead', label: 'Dead worlds' },
  { key: 'mineral', label: 'Mineral worlds' },
  { key: 'life', label: 'Life worlds' },
  { key: 'colony', label: 'Colonies' },
  { key: 'fortifiedColony', label: 'Fortified colonies' },
  { key: 'mine', label: 'Mines' },
  { key: 'fortifiedMine', label: 'Fortified mines' },
];

const VICTORY_ROWS = [
  { key: 'enemyHasNoShips', label: 'Wins if enemy has no ships' },
  { key: 'enemyHasNoColonies', label: 'Wins if enemy has no colonies' },
  { key: 'enemyHasNoMines', label: 'Wins if enemy has no mines' },
] as const;

const numberInput = (field: string, value: number, max: number) =>
  `<input type="number" data-field="${field}" value="${value}" min="0" max="${max}" step="1" />`;
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const checkbox = (field: string, checked: boolean) => `<input type="checkbox" data-field="${field}"${checked ? ' checked' : ''} />`;

/** The custom settings form. Every input names the setting it edits in data-field. */
export function renderCustomForm(sc: ScenarioConfig): string {
  const head = `<tr><th></th>${SIDES.map((s) => `<th class="side-${s.faction}">${s.label}</th>`).join('')}</tr>`;
  const row = (label: string, cell: (f: Faction) => string) =>
    `<tr><td>${label}</td>${SIDES.map((s) => `<td>${cell(s.faction)}</td>`).join('')}</tr>`;
  const sideRows = [
    row('Starbase', (f) => checkbox(`${f}.starbase`, sc.sides[f].starbase)),
    row('Starbucks', (f) => numberInput(`${f}.starbucks`, sc.sides[f].starbucks, 999)),
    ...WORLD_ROWS.map((w) => row(w.label, (f) => numberInput(`${f}.worlds.${w.key}`, sc.sides[f].worlds[w.key], 50))),
    ...VICTORY_ROWS.map((v) => row(v.label, (f) => checkbox(`${f}.victory.${v.key}`, sc.sides[f].victory[v.key]))),
  ].join('');
  const shipTables = SIDES.map(({ faction, label }) => {
    const rows = SHIP_ROSTER[faction]
      .map((def) => {
        const start = sc.sides[faction].ships.filter((s) => s.role === def.role).length;
        const canBuild = !sc.sides[faction].cannotBuild.includes(def.role);
        return `<tr><td>${def.name} <span class="cost">(${def.cost})</span></td>
          <td>${numberInput(`${faction}.start.${def.role}`, start, MAX_STARTING_SHIPS)}</td>
          <td>${checkbox(`${faction}.build.${def.role}`, canBuild)}</td></tr>`;
      })
      .join('');
    return `<table class="custom-table"><tr><th class="side-${faction}">${label} ships</th><th>Start with</th><th>Can build</th></tr>${rows}</table>`;
  }).join('');
  const firstMove = sc.firstMove ?? 'human';
  const option = (value: string, text: string) => `<option value="${value}"${firstMove === value ? ' selected' : ''}>${text}</option>`;
  const text = (field: 'title' | 'menuLine', label: string, max: number) =>
    `<tr><td>${label}</td><td><input type="text" data-field="${field}" maxlength="${max}" value="${escapeHtml(sc[field] ?? '')}" /></td></tr>`;
  return `
    <table class="custom-table">
      ${text('title', 'Title', 15)}
      ${text('menuLine', 'Menu line', 59)}
      <tr><td>Description</td><td><textarea data-field="description" maxlength="839" rows="3">${escapeHtml(sc.description ?? '')}</textarea></td></tr>
    </table>
    <table class="custom-table">${head}${sideRows}</table>
    ${shipTables}
    <table class="custom-table">
      <tr><td>Moves first</td><td><select data-field="firstMove">${option('human', 'You')}${option('hierarchy', 'Hierarchy')}${option('alliance', 'Alliance')}</select></td></tr>
      <tr><td>Actions per side per turn</td><td>${numberInput('actionsPerTurn', sc.actionsPerTurn, 9)}</td></tr>
      <tr><td>Starbucks per mine per turn</td><td>${numberInput('mineIncomePerTurn', sc.mineIncomePerTurn, 99)}</td></tr>
      <tr><td>Random events off (DOS game only)</td><td>${checkbox('randomEventsOff', sc.randomEventsOff ?? false)}</td></tr>
    </table>
    <div class="custom-actions">
      <button data-action="reset-custom">Reset to defaults</button>
      <select id="save-slot" aria-label="Scenario slot">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option value="${n}">SCENARIO.${n}</option>`).join('')}</select>
      <button data-action="save-custom">Save as SCENARIO file</button>
    </div>
    <div class="save-note">The file is for Star Control 1 on DOS. Actions per turn and mine income aren't part of it, and "You" moving first is saved as the Alliance moving first.</div>
    <div id="custom-problems"></div>`;
}

/** Writes one edited input back into the scenario. */
export function applyCustomInput(sc: ScenarioConfig, input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const field = input.dataset.field;
  if (!field) return;
  const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
  const num = () => (input.value.trim() === '' ? NaN : Number(input.value));
  const [first, key, sub] = field.split('.');
  if (first === 'title' || first === 'menuLine' || first === 'description') {
    sc[first] = input.value;
    return;
  }
  if (first === 'randomEventsOff') {
    sc.randomEventsOff = value as boolean;
    return;
  }
  if (first === 'firstMove') {
    sc.firstMove = value === 'human' ? undefined : (value as Faction);
    return;
  }
  if (first === 'actionsPerTurn' || first === 'mineIncomePerTurn') {
    sc[first] = num();
    return;
  }
  const side = sc.sides[first as Faction];
  if (key === 'starbase') side.starbase = value as boolean;
  else if (key === 'starbucks') side.starbucks = num();
  else if (key === 'worlds') side.worlds[sub as keyof WorldCounts] = num();
  else if (key === 'victory') side.victory[sub as keyof typeof side.victory] = value as boolean;
  else if (key === 'build') {
    side.cannotBuild = side.cannotBuild.filter((role) => role !== sub);
    if (!value) side.cannotBuild.push(sub);
  } else if (key === 'start') {
    const count = Math.max(0, Math.floor(num()) || 0);
    const others = side.ships.filter((s) => s.role !== sub);
    side.ships = [...others, ...Array.from({ length: count }, () => ({ role: sub, zone: 0 as const }))];
    // Keep the roster's order so the summary and the map list ships the same way each time.
    const order = SHIP_ROSTER[first as Faction].map((d) => d.role);
    side.ships.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  }
}
