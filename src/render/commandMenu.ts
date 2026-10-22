import type { GameState } from '../model/types';
import type { ReachablePlanet } from '../game/gameState';
import { menuItems, unitPlanetId, type KeyboardUi } from '../ui/keyboardControl';

const KEYS = {
  unit: 'Arrows: next unit · Enter: orders · Space: deselect',
  menu: 'Arrows: highlight · Enter: select · Space: back',
  destination: 'Arrows: next star · Enter: move there · Space: back',
};

function unitName(ui: KeyboardUi, state: GameState): string {
  const unit = ui.unit;
  if (!unit) return 'Nothing selected';
  if (unit.kind === 'end-turn') return 'End turn';
  const planet = state.planets.find((p) => p.id === unitPlanetId(unit, state));
  if (unit.kind === 'starbase') return `Starbase at ${planet?.name ?? '?'}`;
  const ship = state.ships.find((s) => s.id === unit.shipId);
  return `${ship?.type ?? 'Ship'} at ${planet?.name ?? '?'}`;
}

/** The keyboard's order menu in the side panel, mirroring SC1's command menu. */
export function renderCommandMenu(
  container: HTMLElement,
  state: GameState,
  ui: KeyboardUi,
  reachable: Map<string, ReachablePlanet> | undefined,
): void {
  const title = `<div class="title">${unitName(ui, state)}</div>`;
  if (ui.mode === 'orders' || ui.mode === 'build') {
    const items = menuItems(ui, state)
      .map(
        (item, i) =>
          `<div class="item ${item.status}${i === ui.menuIndex ? ' highlighted' : ''}" data-menu-index="${i}">${item.label}</div>`,
      )
      .join('');
    container.innerHTML = `${title}${items || '<em>No orders.</em>'}<div class="keys">${KEYS.menu}</div>`;
    return;
  }
  if (ui.mode === 'destination') {
    const target = ui.destinationId ? reachable?.get(ui.destinationId) : undefined;
    const planet = state.planets.find((p) => p.id === ui.destinationId);
    const line = target && planet
      ? `MOVE to ${planet.explored ? planet.name : 'an unexplored star'} (${target.cost} jump${target.cost > 1 ? 's' : ''})`
      : 'No star in reach.';
    container.innerHTML = `${title}<div class="item highlighted">${line}</div><div class="keys">${KEYS.destination}</div>`;
    return;
  }
  container.innerHTML = `${title}<div class="keys">${KEYS.unit}</div>`;
}
