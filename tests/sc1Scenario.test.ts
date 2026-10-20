import { describe, expect, it } from 'vitest';
import { parseSc1Scenario, sc1ToScenarioConfig, ScenarioFileError, SC1_SCENARIO_SIZE } from '../src/generation/sc1Scenario';
import { SC1_PRESETS } from '../src/generation/sc1Presets';
import { winner, buildShip, InvalidActionError } from '../src/game/gameState';
import { generateGalaxy } from '../src/generation/galaxyGenerator';

/** A made-up scenario file in SC1's layout. */
function makeFile(): Uint8Array {
  const bytes = new Uint8Array(SC1_SCENARIO_SIZE);
  const text = (offset: number, s: string) => s.split('').forEach((c, i) => (bytes[offset + i] = c.charCodeAt(0)));
  text(0x000, 'TEST TITLE');
  text(0x010, 'A menu line');
  text(0x080, 'Line one.\r\nLine two.');
  // Alliance: starbase, a Chenjesu (1) in zone 0 and a Shofixti (7) in zone 2, wins on no
  // ships, Hierarchy first, 300 Starbucks, cannot build Yehat (2), 2 dead + 1 fortified mine.
  bytes.set([1, 1, 7, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0x09, 300 & 0xff, 300 >> 8, 0b10, 2, 0, 0, 0, 0, 0, 1], 0x04c);
  // Hierarchy: no starbase, an Umgah (7), 3 life worlds and a colony.
  bytes.set([0, 7, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 0, 0], 0x066);
  return bytes;
}

describe('parseSc1Scenario', () => {
  it('reads every field of the file', () => {
    const sc1 = parseSc1Scenario(makeFile(), 'SCENARIO.X');
    expect(sc1.title).toBe('TEST TITLE');
    expect(sc1.menuLine).toBe('A menu line');
    expect(sc1.description).toBe('Line one. Line two.');
    expect(sc1.alliance).toEqual({ starbase: true, ships: [1, 7, 0, 0, 0, 0, 0], zones: [0, 2, 0, 0, 0, 0, 0], flags: 0x09, starbucks: 300, noBuild: 2, worlds: [2, 0, 0, 0, 0, 0, 1] });
    expect(sc1.hierarchy.worlds).toEqual([0, 0, 3, 1, 0, 0, 0]);
  });

  it('converts it to the game’s scenario settings', () => {
    const sc = sc1ToScenarioConfig(parseSc1Scenario(makeFile()));
    expect(sc.firstMove).toBe('hierarchy');
    expect(sc.sides.alliance.ships).toEqual([
      { role: 'chenjesu-broodhome', zone: 0 },
      { role: 'shofixti-scout', zone: 2 },
    ]);
    expect(sc.sides.alliance.cannotBuild).toEqual(['yehat-terminator']);
    expect(sc.sides.alliance.victory).toEqual({ enemyHasNoShips: true, enemyHasNoColonies: false, enemyHasNoMines: false });
    expect(sc.sides.alliance.worlds).toEqual({ dead: 2, mineral: 0, life: 0, colony: 0, fortifiedColony: 0, mine: 0, fortifiedMine: 1 });
    expect(sc.sides.hierarchy.ships).toEqual([{ role: 'umgah-drone', zone: 3 }]);
    expect(sc.sides.hierarchy.starbase).toBe(false);
  });

  it('rejects files of the wrong size or with too few worlds', () => {
    expect(() => parseSc1Scenario(new Uint8Array(100))).toThrow(ScenarioFileError);
    expect(() => parseSc1Scenario(new Uint8Array(SC1_SCENARIO_SIZE))).toThrow(ScenarioFileError);
  });
});

describe('SC1 presets', () => {
  it('maps roster numbers to the right ships', () => {
    const [beginnersLuck, , exterminate] = SC1_PRESETS.map(sc1ToScenarioConfig);
    expect(beginnersLuck.sides.alliance.ships.map((s) => s.role)).toEqual(['syreen-penetrator']);
    expect(beginnersLuck.sides.hierarchy.ships.map((s) => s.role)).toEqual(['androsynth-guardian', 'androsynth-guardian']);
    expect(exterminate.sides.hierarchy.ships.map((s) => s.role)).toEqual(['ur-quan-dreadnought']);
    expect(exterminate.sides.alliance.cannotBuild).not.toContain('shofixti-scout');
    expect(exterminate.sides.alliance.cannotBuild.length).toBe(6);
  });

  it('enforces build restrictions and victory conditions in play', () => {
    const exterminate = sc1ToScenarioConfig(SC1_PRESETS[2]);
    const state = generateGalaxy(exterminate, 'alliance', 3);
    state.currentFaction = 'alliance';
    state.starbucks.alliance = 100;
    const base = state.planets.find((p) => p.hasStarbase && p.owner === 'alliance')!;
    expect(() => buildShip('alliance', base.id, 'chenjesu-broodhome', state)).toThrow(InvalidActionError);
    buildShip('alliance', base.id, 'shofixti-scout', state);

    // The Hierarchy wins when the Alliance has no colonies left.
    expect(winner(state)).toBeNull();
    for (const p of state.planets) if (p.owner === 'alliance' && p.improvement === 'colony') p.improvement = undefined;
    expect(winner(state)).toBe('hierarchy');
  });
});
