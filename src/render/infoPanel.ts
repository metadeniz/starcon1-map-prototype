import type { Faction, GameState, Planet, Ship } from '../model/types';
import { SHIP_ROSTER } from '../model/shipRoster';
import { buildableRoles, STARBASE_MOVE_ACTIONS } from '../game/gameState';
import { buildDurationTurns, IMPROVEMENT_LABEL, IMPROVEMENT_TYPES, isImprovementAllowed } from '../model/improvements';

const OWNER_LABEL: Record<Planet['owner'], string> = {
  alliance: 'Alliance of Free Stars',
  hierarchy: 'Hierarchy of Battle Thralls',
  neutral: 'Neutral',
};

const TYPE_LABEL: Record<Planet['type'], string> = {
  life: 'Life world',
  mineral: 'Mineral world',
  dead: 'Dead world',
};

function renderShipRow(ship: Ship, selectedShipId: string | undefined, humanFaction: Faction): string {
  const selected = ship.id === selectedShipId;
  const selectButton =
    ship.owner === humanFaction
      ? `<button data-action="select-ship" data-ship="${ship.id}" ${selected ? 'disabled' : ''}>${selected ? 'Selected' : 'Select'}</button>`
      : '';
  return `
    <div class="row ship-row${selected ? ' ship-row-selected' : ''}">
      <span class="label">${OWNER_LABEL[ship.owner]} ${ship.type}</span>
      <span>crew ${ship.currentCrew}/${ship.crew}</span>
    </div>
    ${selectButton}
  `;
}

function renderShipOrders(ship: Ship, planet: Planet, actionsRemaining: number): string {
  if (planet.hasStarbase || planet.improvement || planet.underConstruction) return '';
  const disabled = actionsRemaining < 1 ? 'disabled' : '';
  const turns = buildDurationTurns(ship.crew);
  const buttons = IMPROVEMENT_TYPES.filter((type) => isImprovementAllowed(planet, type))
    .map(
      (type) =>
        `<button data-action="start-construction" data-ship="${ship.id}" data-type="${type}" ${disabled}>${IMPROVEMENT_LABEL[type]} (${turns} turn${turns > 1 ? 's' : ''})</button>`,
    )
    .join(' ');
  if (!buttons) return '';
  return `<div class="action-group"><div class="label">Orders for ${ship.type}</div>${buttons}</div>`;
}

function renderShipBuildActions(state: GameState, planet: Planet, owner: Faction): string {
  if (!(planet.hasStarbase && planet.owner === owner)) return '';
  const allowed = buildableRoles(state, owner);
  const buttons = SHIP_ROSTER[owner]
    .filter((def) => allowed.includes(def.role))
    .map((def) => {
      const affordable = state.starbucks[owner] >= def.cost && state.actionsRemaining >= 1;
      return `<button data-action="build-ship" data-owner="${owner}" data-role="${def.role}" data-planet="${planet.id}" ${affordable ? '' : 'disabled'}>${def.name} (${def.cost}, crew ${def.crew})</button>`;
    })
    .join(' ');
  return `<div class="faction-actions"><h4>${OWNER_LABEL[owner]} actions (${state.starbucks[owner]} Starbucks)</h4><div class="action-group"><div class="label">Build ship</div>${buttons}</div></div>`;
}

function renderStarbaseMoveAction(planet: Planet, actionsRemaining: number, movingStarbaseFromPlanetId: string | undefined): string {
  if (!planet.hasStarbase || planet.owner === 'neutral') return '';
  if (actionsRemaining < STARBASE_MOVE_ACTIONS) {
    return `<div class="action-group"><div class="label">Starbase</div><em>Moving it takes ${STARBASE_MOVE_ACTIONS} actions; ${actionsRemaining} left this turn.</em></div>`;
  }
  if (movingStarbaseFromPlanetId === planet.id) {
    return `<div class="action-group"><div class="label">Starbase</div><em>Choose a highlighted planet to relocate it to.</em></div>`;
  }
  return `<div class="action-group"><div class="label">Starbase</div><button data-action="move-starbase" data-planet="${planet.id}">Move 1 step (${STARBASE_MOVE_ACTIONS} actions)</button></div>`;
}

export function renderInfoPanel(
  container: HTMLElement,
  state: GameState,
  selectedPlanetId: string | undefined,
  selectedShipId: string | undefined,
  movingStarbaseFromPlanetId?: string,
): void {
  const planet = state.planets.find((p) => p.id === selectedPlanetId);
  if (!planet) {
    container.innerHTML = '<div id="info-empty">No planet selected.</div>';
    return;
  }

  const shipsHere = state.ships.filter((s) => s.planetId === planet.id);
  const shipRows = shipsHere.map((s) => renderShipRow(s, selectedShipId, state.humanFaction)).join('');

  const selectedShip = shipsHere.find((s) => s.id === selectedShipId && s.owner === state.humanFaction);
  const ordersHtml = selectedShip && planet.explored ? renderShipOrders(selectedShip, planet, state.actionsRemaining) : '';

  const typeLabel = planet.explored ? TYPE_LABEL[planet.type] : 'Unknown';
  const ownerLabel = planet.explored ? OWNER_LABEL[planet.owner] : 'Unknown';
  const starbaseLabel = planet.explored ? (planet.hasStarbase ? 'Yes' : 'No') : 'Unknown';
  const improvementLabel = planet.explored ? (planet.improvement ? `${IMPROVEMENT_LABEL[planet.improvement]}${planet.fortified ? ' (fortified)' : ''}` : 'None') : 'Unknown';
  const constructionRow =
    planet.explored && planet.underConstruction
      ? `<div class="row"><span class="label">Under construction</span><span>${IMPROVEMENT_LABEL[planet.underConstruction.type]} for ${OWNER_LABEL[planet.underConstruction.owner]} (${planet.underConstruction.turnsRemaining} turn${planet.underConstruction.turnsRemaining > 1 ? 's' : ''} left)</span></div>`
      : '';

  const buildShipHtml = planet.explored ? renderShipBuildActions(state, planet, state.humanFaction) : '';
  const starbaseMoveHtml =
    planet.explored && planet.hasStarbase && planet.owner === state.humanFaction
      ? renderStarbaseMoveAction(planet, state.actionsRemaining, movingStarbaseFromPlanetId)
      : '';

  container.innerHTML = `
    <h3 style="margin: 0 0 4px 0;">${planet.name}</h3>
    <div class="row"><span class="label">Type</span><span>${typeLabel}</span></div>
    <div class="row"><span class="label">Owner</span><span>${ownerLabel}</span></div>
    <div class="row"><span class="label">Starbase</span><span>${starbaseLabel}</span></div>
    <div class="row"><span class="label">Improvement</span><span>${improvementLabel}</span></div>
    ${constructionRow}
    <div id="fleet-list">${shipRows || '<em>No ships present.</em>'}</div>
    ${ordersHtml}
    ${starbaseMoveHtml}
    ${buildShipHtml}
  `;
}
