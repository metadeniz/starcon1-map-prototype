import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/generation/galaxyGenerator';
import { DEFAULT_SCENARIO } from '../src/generation/scenarioConfig';
import { handleGameKey, menuItems, newKeyboardUi, resetKeyboardUi, unitCycle, type KeyboardUi } from '../src/ui/keyboardControl';
import type { Selection } from '../src/ui/inputHandler';
import type { GameState } from '../src/model/types';

function setup(): { state: GameState; selection: Selection; ui: KeyboardUi } {
  const state = generateGalaxy(structuredClone(DEFAULT_SCENARIO), 'alliance', 7);
  state.currentFaction = 'alliance';
  const selection: Selection = {};
  const ui = newKeyboardUi();
  resetKeyboardUi(ui, state, selection);
  return { state, selection, ui };
}

const press = (keys: string[], { state, selection, ui }: ReturnType<typeof setup>) =>
  keys.map((key) => handleGameKey(key, state, selection, ui));

/** Arrows the highlighter onto the first unit of a kind. */
function highlight(ctx: ReturnType<typeof setup>, kind: 'ship' | 'starbase'): void {
  for (let i = 0; i < 20 && ctx.ui.unit?.kind !== kind; i++) press(['ArrowRight'], ctx);
  expect(ctx.ui.unit?.kind).toBe(kind);
}

describe('keyboard control', () => {
  it('cycles through every unit of the human side, then END TURN', () => {
    const { state } = setup();
    const units = unitCycle(state);
    const ships = state.ships.filter((s) => s.owner === 'alliance').length;
    const starbases = state.planets.filter((p) => p.owner === 'alliance' && p.hasStarbase).length;
    expect(units).toHaveLength(ships + starbases + 1);
    expect(units[units.length - 1]).toEqual({ kind: 'end-turn' });
  });

  it('moves the highlighter with the arrows and wraps around', () => {
    const ctx = setup();
    const units = unitCycle(ctx.state);
    expect(ctx.ui.unit).toEqual(units[0]);
    expect(press(['ArrowRight'], ctx)[0]).toEqual({ handled: true, sound: 'move' });
    expect(ctx.ui.unit).toEqual(units[1]);
    press(['ArrowLeft', 'ArrowUp'], ctx);
    expect(ctx.ui.unit).toEqual(units[units.length - 1]);
  });

  it('ignores keys that are not the game controls', () => {
    const ctx = setup();
    expect(press(['a'], ctx)[0].handled).toBe(false);
  });

  it('selects a ship, picks a destination with the arrows and moves there', () => {
    const ctx = setup();
    highlight(ctx, 'ship');
    const shipId = (ctx.ui.unit as { shipId: string }).shipId;
    expect(ctx.selection.selectedShipId).toBe(shipId);

    press(['Enter'], ctx);
    expect(ctx.ui.mode).toBe('orders');
    expect(menuItems(ctx.ui, ctx.state)[ctx.ui.menuIndex]).toMatchObject({ key: 'move', status: 'available' });

    press(['Enter'], ctx);
    expect(ctx.ui.mode).toBe('destination');
    const first = ctx.ui.destinationId;
    expect(ctx.selection.reachable?.has(first!)).toBe(true);
    press(['ArrowRight'], ctx);
    const target = ctx.ui.destinationId!;
    expect(target).not.toBe(first);

    expect(press(['Enter'], ctx)[0].sound).toBe('select');
    expect(ctx.state.ships.find((s) => s.id === shipId)!.planetId).toBe(target);
    expect(ctx.ui.mode).toBe('unit');
  });

  it('backs out one step at a time with Space', () => {
    const ctx = setup();
    highlight(ctx, 'ship');
    press(['Enter', 'Enter'], ctx);
    expect(ctx.ui.mode).toBe('destination');
    press([' '], ctx);
    expect(ctx.ui.mode).toBe('orders');
    expect(menuItems(ctx.ui, ctx.state)[ctx.ui.menuIndex].key).toBe('move');
    press([' '], ctx);
    expect(ctx.ui.mode).toBe('unit');
    press([' '], ctx);
    expect(ctx.ui.unit).toBeUndefined();
    expect(ctx.selection.selectedShipId).toBeUndefined();
  });

  it('builds a ship from the starbase BUILD menu', () => {
    const ctx = setup();
    highlight(ctx, 'starbase');
    press(['Enter'], ctx);
    expect(menuItems(ctx.ui, ctx.state).map((item) => item.key)).toEqual(['build', 'move-starbase']);
    press(['Enter'], ctx);
    expect(ctx.ui.mode).toBe('build');
    const items = menuItems(ctx.ui, ctx.state);
    expect(items[ctx.ui.menuIndex].status).toBe('available');
    const before = ctx.state.ships.length;
    press(['Enter'], ctx);
    expect(ctx.state.ships.length).toBe(before + 1);
    expect(ctx.ui.mode).toBe('unit');
  });

  it('skips options that cannot be used', () => {
    const ctx = setup();
    highlight(ctx, 'starbase');
    press(['Enter', 'Enter'], ctx);
    const items = menuItems(ctx.ui, ctx.state);
    expect(items.some((item) => item.status === 'unavailable')).toBe(true); // 25 Starbucks can't buy them all
    for (let i = 0; i < items.length; i++) {
      press(['ArrowDown'], ctx);
      expect(items[ctx.ui.menuIndex].status).toBe('available');
    }
  });

  it('ends the turn from the END TURN stop', () => {
    const ctx = setup();
    press(['ArrowLeft'], ctx);
    expect(ctx.ui.unit).toEqual({ kind: 'end-turn' });
    expect(press(['Enter'], ctx)[0]).toEqual({ handled: true, sound: 'select', endTurn: true });
  });
});
