import type { Faction, GameState, ImprovementType } from '../model/types';
import { SHIP_ROSTER, type ShipRole } from '../model/shipRoster';
import { IMPROVEMENT_TYPES, isImprovementAllowed } from '../model/improvements';
import {
  besiege,
  buildShip,
  buildableRoles,
  canBesiege,
  InvalidActionError,
  InvalidMoveError,
  moveShip,
  moveStarbase,
  starbaseDestinations,
  startConstruction,
} from '../game/gameState';
import { selectShip, startMovingStarbase, type Selection } from './inputHandler';
import type { MenuSound } from './sounds';

// SC1's strategic interface, driven from the keyboard. As in SC1:
// - A highlighter picks one of your units (ship or starbase). The arrow keys move it.
// - Enter (fire) opens that unit's orders: MOVE, COLONIZE, MINE, FORTIFY (BESIEGE at an enemy
//   fortification), or BUILD for a starbase. Options that can't be used now are shown in black and are skipped by the highlight;
//   one that is already under way is shown in red.
// - MOVE lights the routes to every star the ship can reach. Left/right step through them, the
//   light-blue one is the current choice, and Enter jumps there.
// - Space backs out one step: destination -> orders -> unit -> nothing highlighted.
// The last stop in the unit cycle is END TURN, so a whole turn can be played without the mouse.

export type UnitRef = { kind: 'ship'; shipId: string } | { kind: 'starbase'; planetId: string } | { kind: 'end-turn' };

export type KeyMode = 'unit' | 'orders' | 'build' | 'destination';

export interface KeyboardUi {
  mode: KeyMode;
  unit?: UnitRef;
  /** The highlighted entry of the orders or build menu. */
  menuIndex: number;
  /** The highlighted destination while choosing where to move. */
  destinationId?: string;
  /** A result to show the player, such as how a siege went. The page clears it once shown. */
  message?: string;
}

export type MenuStatus = 'available' | 'unavailable' | 'in-process';

export interface MenuItem {
  key: string;
  label: string;
  status: MenuStatus;
}

export interface KeyResult {
  /** False when the key isn't one of the game's, so the browser can handle it. */
  handled: boolean;
  sound?: MenuSound;
  endTurn?: boolean;
}

export const IMPROVEMENT_VERB: Record<ImprovementType, string> = {
  colony: 'COLONIZE',
  mine: 'MINE',
  fortification: 'FORTIFY',
};

export function newKeyboardUi(): KeyboardUi {
  return { mode: 'unit', menuIndex: 0 };
}

const sameUnit = (a: UnitRef | undefined, b: UnitRef | undefined) =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/** Whether an action would succeed now, found by trying it on a copy of the game. */
function wouldSucceed(state: GameState, act: (copy: GameState) => void): boolean {
  try {
    act(structuredClone(state));
    return true;
  } catch (err) {
    if (err instanceof InvalidActionError || err instanceof InvalidMoveError) return false;
    throw err;
  }
}

export function unitPlanetId(unit: UnitRef | undefined, state: GameState): string | undefined {
  if (!unit) return undefined;
  if (unit.kind === 'ship') return state.ships.find((s) => s.id === unit.shipId)?.planetId;
  if (unit.kind === 'starbase') return unit.planetId;
  return undefined;
}

/**
 * The human's units in the order the highlighter visits them: top to bottom across the map, then
 * left to right, with a planet's starbase before its ships. END TURN comes last.
 */
export function unitCycle(state: GameState): UnitRef[] {
  const side = state.humanFaction;
  const planets = [...state.planets].sort((a, b) => a.y - b.y || a.x - b.x);
  const units: UnitRef[] = [];
  for (const planet of planets) {
    if (planet.hasStarbase && planet.owner === side) units.push({ kind: 'starbase', planetId: planet.id });
    for (const ship of state.ships) {
      if (ship.owner === side && ship.planetId === planet.id) units.push({ kind: 'ship', shipId: ship.id });
    }
  }
  units.push({ kind: 'end-turn' });
  return units;
}

export function menuItems(ui: KeyboardUi, state: GameState): MenuItem[] {
  const unit = ui.unit;
  const side = state.humanFaction;
  const status = (ok: boolean): MenuStatus => (ok ? 'available' : 'unavailable');

  if (unit?.kind === 'ship' && ui.mode === 'orders') {
    const ship = state.ships.find((s) => s.id === unit.shipId);
    const planet = state.planets.find((p) => p.id === ship?.planetId);
    if (!ship || !planet) return [];
    const canMove = state.connections.some((c) => {
      const to = c.a === planet.id ? c.b : c.b === planet.id ? c.a : undefined;
      return to !== undefined && wouldSucceed(state, (copy) => moveShip(copy.ships.find((s) => s.id === ship.id)!, to, copy));
    });
    const items: MenuItem[] = [{ key: 'move', label: 'MOVE', status: status(canMove) }];
    if (canBesiege(ship, state)) {
      items.push({ key: 'besiege', label: 'BESIEGE', status: status(wouldSucceed(state, (copy) => besiege(ship.id, copy, () => 1))) });
    }
    for (const type of IMPROVEMENT_TYPES) {
      if (!isImprovementAllowed(planet, type)) continue;
      const building = planet.underConstruction;
      items.push({
        key: `construct:${type}`,
        label: IMPROVEMENT_VERB[type],
        status:
          building?.shipId === ship.id && building.type === type
            ? 'in-process'
            : status(planet.explored && wouldSucceed(state, (copy) => startConstruction(ship.id, type, copy))),
      });
    }
    return items;
  }

  if (unit?.kind === 'starbase' && ui.mode === 'orders') {
    const planet = state.planets.find((p) => p.id === unit.planetId);
    if (!planet) return [];
    const canMove = starbaseDestinations(planet, state).some((to) =>
      wouldSucceed(state, (copy) => moveStarbase(planet.id, to, copy)),
    );
    const canBuild = buildableRoles(state, side).some((role) => buildable(state, side, planet.id, role));
    return [
      { key: 'build', label: 'BUILD', status: status(canBuild) },
      { key: 'move-starbase', label: 'MOVE', status: status(canMove) },
    ];
  }

  if (unit?.kind === 'starbase' && ui.mode === 'build') {
    const allowed = buildableRoles(state, side);
    return SHIP_ROSTER[side]
      .filter((def) => allowed.includes(def.role))
      .map((def) => ({
        key: `build:${def.role}`,
        label: `${def.name} (${def.cost})`,
        status: status(buildable(state, side, unit.planetId, def.role)),
      }));
  }
  return [];
}

function buildable(state: GameState, side: Faction, planetId: string, role: ShipRole): boolean {
  return wouldSucceed(state, (copy) => buildShip(side, planetId, role, copy));
}

/** Destinations in clockwise order around the unit's planet, starting straight up. */
export function destinationOrder(state: GameState, selection: Selection, fromPlanetId: string): string[] {
  const from = state.planets.find((p) => p.id === fromPlanetId);
  if (!from || !selection.reachable) return [];
  const angle = (id: string) => {
    const p = state.planets.find((q) => q.id === id)!;
    const a = Math.atan2(p.x - from.x, from.y - p.y);
    return a < 0 ? a + Math.PI * 2 : a;
  };
  return [...selection.reachable.keys()].filter((id) => id !== fromPlanetId).sort((a, b) => angle(a) - angle(b));
}

/** Points the selection (and so the side panel) at the highlighted unit. */
function focusUnit(ui: KeyboardUi, state: GameState, selection: Selection): void {
  selection.movingStarbaseFromPlanetId = undefined;
  selection.reachable = undefined;
  selection.selectedShipId = undefined;
  if (ui.unit?.kind === 'ship') {
    selectShip(ui.unit.shipId, state, selection);
  } else {
    selection.selectedPlanetId = unitPlanetId(ui.unit, state);
  }
}

/** Keeps the highlighter on a unit that still exists, falling back to the first one. */
export function syncKeyboardUi(ui: KeyboardUi, state: GameState, selection: Selection): void {
  const units = unitCycle(state);
  if (!units.some((u) => sameUnit(u, ui.unit))) {
    ui.unit = units[0];
    ui.mode = 'unit';
  }
  if (ui.mode === 'unit') focusUnit(ui, state, selection);
}

/** Starts the highlighter on the first unit, as at the start of each of the human's turns. */
export function resetKeyboardUi(ui: KeyboardUi, state: GameState, selection: Selection): void {
  ui.mode = 'unit';
  ui.unit = unitCycle(state)[0];
  ui.menuIndex = 0;
  ui.destinationId = undefined;
  focusUnit(ui, state, selection);
}

/** Moves the highlighter onto a unit picked with the mouse, so the keyboard carries on from there. */
export function followMouseSelection(ui: KeyboardUi, selection: Selection): void {
  ui.mode = 'unit';
  ui.destinationId = undefined;
  if (selection.selectedShipId) ui.unit = { kind: 'ship', shipId: selection.selectedShipId };
}

function step<T>(list: T[], index: number, delta: number): number {
  return (index + delta + list.length) % list.length;
}

/** The next available menu entry from `index` in direction `delta`, or `index` if there is none. */
function nextAvailable(items: MenuItem[], index: number, delta: number): number {
  for (let i = 1; i <= items.length; i++) {
    const j = step(items, index, delta * i);
    if (items[j].status === 'available') return j;
  }
  return index;
}

function openMenu(ui: KeyboardUi, state: GameState, mode: 'orders' | 'build'): void {
  ui.mode = mode;
  const items = menuItems(ui, state);
  const first = items.findIndex((item) => item.status === 'available');
  ui.menuIndex = first >= 0 ? first : 0;
}

const KEY_DELTA: Record<string, number> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
const SELECT_KEYS = new Set(['Enter', 'NumpadEnter']);
const BACK_KEYS = new Set([' ', 'Spacebar']);

/** Handles one key press during the human's turn, changing `ui`, `selection` and `state` in place. */
export function handleGameKey(key: string, state: GameState, selection: Selection, ui: KeyboardUi): KeyResult {
  const delta = KEY_DELTA[key];
  const isSelect = SELECT_KEYS.has(key);
  const isBack = BACK_KEYS.has(key);
  if (delta === undefined && !isSelect && !isBack) return { handled: false };
  if (state.currentFaction !== state.humanFaction) return { handled: true };

  if (ui.mode === 'unit') {
    const units = unitCycle(state);
    const index = units.findIndex((u) => sameUnit(u, ui.unit));
    if (delta !== undefined) {
      ui.unit = units[index < 0 ? 0 : step(units, index, delta)];
      focusUnit(ui, state, selection);
      return { handled: true, sound: 'move' };
    }
    if (isBack) {
      if (!ui.unit) return { handled: true };
      ui.unit = undefined;
      focusUnit(ui, state, selection);
      return { handled: true, sound: 'select' };
    }
    if (!ui.unit) {
      ui.unit = units[0];
      focusUnit(ui, state, selection);
      return { handled: true, sound: 'move' };
    }
    if (ui.unit.kind === 'end-turn') return { handled: true, sound: 'select', endTurn: true };
    openMenu(ui, state, 'orders');
    return { handled: true, sound: 'select' };
  }

  if (ui.mode === 'orders' || ui.mode === 'build') {
    const items = menuItems(ui, state);
    if (delta !== undefined) {
      const next = nextAvailable(items, ui.menuIndex, delta);
      if (next === ui.menuIndex) return { handled: true };
      ui.menuIndex = next;
      return { handled: true, sound: 'move' };
    }
    if (isBack) {
      if (ui.mode === 'build') {
        openMenu(ui, state, 'orders');
      } else {
        ui.mode = 'unit';
        focusUnit(ui, state, selection);
      }
      return { handled: true, sound: 'select' };
    }
    const item = items[ui.menuIndex];
    if (!item || item.status !== 'available') return { handled: true };
    runMenuItem(item.key, state, selection, ui);
    return { handled: true, sound: 'select' };
  }

  // Choosing a destination.
  const from = ui.unit?.kind === 'starbase' ? ui.unit.planetId : unitPlanetId(ui.unit, state);
  const order = from ? destinationOrder(state, selection, from) : [];
  if (delta !== undefined) {
    if (order.length < 2) return { handled: true };
    const index = order.indexOf(ui.destinationId ?? '');
    ui.destinationId = order[index < 0 ? 0 : step(order, index, delta)];
    return { handled: true, sound: 'move' };
  }
  if (isBack) {
    ui.destinationId = undefined;
    selection.movingStarbaseFromPlanetId = undefined;
    openMenu(ui, state, 'orders');
    // Keep the menu on MOVE, the option being backed out of.
    const items = menuItems(ui, state);
    const moveIndex = items.findIndex((item) => item.key === 'move' || item.key === 'move-starbase');
    if (moveIndex >= 0) ui.menuIndex = moveIndex;
    focusUnit(ui, state, selection);
    return { handled: true, sound: 'select' };
  }
  const to = ui.destinationId;
  if (!to || !from) return { handled: true };
  try {
    if (ui.unit?.kind === 'starbase') {
      moveStarbase(from, to, state);
      ui.unit = { kind: 'starbase', planetId: to };
    } else if (ui.unit?.kind === 'ship') {
      const shipId = ui.unit.shipId;
      moveShip(state.ships.find((s) => s.id === shipId)!, to, state);
    }
  } catch (err) {
    if (!(err instanceof InvalidActionError || err instanceof InvalidMoveError)) throw err;
    return { handled: true };
  }
  ui.destinationId = undefined;
  ui.mode = 'unit';
  focusUnit(ui, state, selection);
  return { handled: true, sound: 'select' };
}

function runMenuItem(key: string, state: GameState, selection: Selection, ui: KeyboardUi): void {
  const unit = ui.unit;
  try {
    if (key === 'move' && unit?.kind === 'ship') {
      selectShip(unit.shipId, state, selection);
      ui.mode = 'destination';
      ui.destinationId = destinationOrder(state, selection, unitPlanetId(unit, state)!)[0];
      return;
    }
    if (key === 'move-starbase' && unit?.kind === 'starbase') {
      startMovingStarbase(unit.planetId, state, selection);
      ui.mode = 'destination';
      ui.destinationId = destinationOrder(state, selection, unit.planetId)[0];
      return;
    }
    if (key === 'build') {
      openMenu(ui, state, 'build');
      return;
    }
    if (key === 'besiege' && unit?.kind === 'ship') {
      ui.message = besiege(unit.shipId, state) ? 'The siege broke the fortification!' : 'The fortification held.';
    } else if (key.startsWith('construct:') && unit?.kind === 'ship') {
      startConstruction(unit.shipId, key.slice('construct:'.length) as ImprovementType, state);
    } else if (key.startsWith('build:') && unit?.kind === 'starbase') {
      buildShip(state.humanFaction, unit.planetId, key.slice('build:'.length) as ShipRole, state);
    }
  } catch (err) {
    if (!(err instanceof InvalidActionError || err instanceof InvalidMoveError)) throw err;
  }
  ui.mode = 'unit';
  focusUnit(ui, state, selection);
}
