import type { Faction, ScenarioConfig, SideSetup, StartZone } from '../model/types';
import { SHIP_ROSTER } from '../model/shipRoster';

// Star Control 1's SCENARIO.1-9 files: 968 bytes, no header.
//   0x000 title (16)   0x010 menu line (60)   0x04C Alliance block (26)
//   0x066 Hierarchy block (26)   0x080 description (840)
// Side block:
//   +00 starbase   +01-07 ships (roster index 1-7, 0 = empty)   +08-0E start zone per ship
//   +0F flags: bit0/1/2 win if the enemy has no ships/colonies/mines;
//       Alliance block only: bit3 Hierarchy moves first, bit4 random events off
//   +10 starting Starbucks (u16)   +12 ships the side can NOT build (bit n = roster index n+1)
//   +13-19 dead, mineral, life, colony, fortified colony, mine, fortified mine

export const SC1_SCENARIO_SIZE = 968;

/** One side's block, as stored in the file. */
export interface Sc1SideBlock {
  starbase: boolean;
  ships: number[];
  zones: number[];
  flags: number;
  starbucks: number;
  noBuild: number;
  /** dead, mineral, life, colony, fortified colony, mine, fortified mine */
  worlds: number[];
}

export interface Sc1Scenario {
  file: string;
  title: string;
  menuLine: string;
  description: string;
  alliance: Sc1SideBlock;
  hierarchy: Sc1SideBlock;
}

const FLAG_HIERARCHY_FIRST = 0x08;
const FLAG_RANDOM_EVENTS_OFF = 0x10;

export class ScenarioFileError extends Error {}

function readText(bytes: Uint8Array, offset: number, length: number): string {
  const slice = bytes.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return Array.from(end < 0 ? slice : slice.subarray(0, end), (b) => String.fromCharCode(b))
    .join('')
    .trim();
}

function readBlock(bytes: Uint8Array, offset: number): Sc1SideBlock {
  const b = bytes.subarray(offset, offset + 26);
  return {
    starbase: b[0] !== 0,
    ships: Array.from(b.subarray(1, 8)),
    zones: Array.from(b.subarray(8, 15)),
    flags: b[15],
    starbucks: b[16] | (b[17] << 8),
    noBuild: b[18],
    worlds: Array.from(b.subarray(19, 26)),
  };
}

export function parseSc1Scenario(bytes: Uint8Array, file = 'SCENARIO'): Sc1Scenario {
  if (bytes.length !== SC1_SCENARIO_SIZE) {
    throw new ScenarioFileError(`${file} is ${bytes.length} bytes; an SC1 scenario file is ${SC1_SCENARIO_SIZE}`);
  }
  const scenario: Sc1Scenario = {
    file,
    title: readText(bytes, 0x000, 16),
    menuLine: readText(bytes, 0x010, 60),
    description: readText(bytes, 0x080, 840).replace(/\s+/g, ' '),
    alliance: readBlock(bytes, 0x04c),
    hierarchy: readBlock(bytes, 0x066),
  };
  const total = [...scenario.alliance.worlds, ...scenario.hierarchy.worlds].reduce((a, b) => a + b, 0);
  // SC1 refuses these too ("Too few stars specified").
  if (total < 2 || total > 50) throw new ScenarioFileError(`${file} has ${total} worlds; SC1 needs 2-50`);
  return scenario;
}

/** SC1 numbers each roster from its most expensive ship (1) to its cheapest (7). */
function roleFor(faction: Faction, index: number): string {
  return SHIP_ROSTER[faction][SHIP_ROSTER[faction].length - index].role;
}

function toSide(faction: Faction, block: Sc1SideBlock): SideSetup {
  const [dead, mineral, life, colony, fortifiedColony, mine, fortifiedMine] = block.worlds;
  return {
    starbase: block.starbase,
    ships: block.ships.flatMap((index, slot) =>
      index >= 1 && index <= 7 ? [{ role: roleFor(faction, index), zone: Math.min(block.zones[slot], 3) as StartZone }] : [],
    ),
    worlds: { dead, mineral, life, colony, fortifiedColony, mine, fortifiedMine },
    starbucks: block.starbucks,
    cannotBuild: [1, 2, 3, 4, 5, 6, 7].filter((index) => block.noBuild & (1 << (index - 1))).map((index) => roleFor(faction, index)),
    victory: {
      enemyHasNoShips: (block.flags & 0x01) !== 0,
      enemyHasNoColonies: (block.flags & 0x02) !== 0,
      enemyHasNoMines: (block.flags & 0x04) !== 0,
    },
  };
}

export function sc1ToScenarioConfig(sc1: Sc1Scenario): ScenarioConfig {
  return {
    title: sc1.title,
    menuLine: sc1.menuLine,
    description: sc1.description || undefined,
    sides: { alliance: toSide('alliance', sc1.alliance), hierarchy: toSide('hierarchy', sc1.hierarchy) },
    firstMove: sc1.alliance.flags & FLAG_HIERARCHY_FIRST ? 'hierarchy' : 'alliance',
    movesPerTurn: 3,
    mineIncomePerTurn: 3,
    randomEventsOff: (sc1.alliance.flags & FLAG_RANDOM_EVENTS_OFF) !== 0,
  };
}

/** SC1 numbers each roster from its most expensive ship (1) to its cheapest (7). */
function indexFor(faction: Faction, role: string): number {
  const rank = SHIP_ROSTER[faction].findIndex((def) => def.role === role);
  if (rank < 0) throw new ScenarioFileError(`Unknown ship "${role}"`);
  return SHIP_ROSTER[faction].length - rank;
}

function toBlock(faction: Faction, side: SideSetup, extraFlags: number): Sc1SideBlock {
  if (side.ships.length > 7) throw new ScenarioFileError('An SC1 scenario holds at most 7 starting ships a side');
  const pad = (values: number[]) => [...values, 0, 0, 0, 0, 0, 0, 0].slice(0, 7);
  const w = side.worlds;
  return {
    starbase: side.starbase,
    ships: pad(side.ships.map((ship) => indexFor(faction, ship.role))),
    zones: pad(side.ships.map((ship) => ship.zone)),
    flags:
      (side.victory.enemyHasNoShips ? 0x01 : 0) |
      (side.victory.enemyHasNoColonies ? 0x02 : 0) |
      (side.victory.enemyHasNoMines ? 0x04 : 0) |
      extraFlags,
    starbucks: side.starbucks,
    noBuild: side.cannotBuild.reduce((bits, role) => bits | (1 << (indexFor(faction, role) - 1)), 0),
    worlds: [w.dead, w.mineral, w.life, w.colony, w.fortifiedColony, w.mine, w.fortifiedMine],
  };
}

/**
 * The SC1 file for a scenario. SC1 has no "the human moves first", so that becomes the
 * Alliance moving first; moves per turn and mine income are the prototype's own and aren't saved.
 */
export function scenarioConfigToSc1(config: ScenarioConfig, file = 'SCENARIO'): Sc1Scenario {
  const allianceFlags =
    (config.firstMove === 'hierarchy' ? FLAG_HIERARCHY_FIRST : 0) | (config.randomEventsOff ? FLAG_RANDOM_EVENTS_OFF : 0);
  return {
    file,
    title: config.title,
    menuLine: config.menuLine ?? '',
    description: config.description ?? '',
    alliance: toBlock('alliance', config.sides.alliance, allianceFlags),
    hierarchy: toBlock('hierarchy', config.sides.hierarchy, 0),
  };
}

/** Text as SC1 stores it: plain ASCII, cut to fit with room for the closing NUL. */
function writeText(bytes: Uint8Array, offset: number, length: number, text: string): void {
  const ascii = text.replace(/\r?\n/g, '\r\n').replace(/[^\x20-\x7e\r\n]/g, '?');
  for (let i = 0; i < Math.min(ascii.length, length - 1); i++) bytes[offset + i] = ascii.charCodeAt(i);
}

function writeBlock(bytes: Uint8Array, offset: number, block: Sc1SideBlock): void {
  bytes.set(
    [
      block.starbase ? 1 : 0,
      ...block.ships,
      ...block.zones,
      block.flags,
      block.starbucks & 0xff,
      block.starbucks >> 8,
      block.noBuild,
      ...block.worlds,
    ],
    offset,
  );
}

/** The 968 bytes of an SC1 SCENARIO file. */
export function writeSc1Scenario(sc1: Sc1Scenario): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(SC1_SCENARIO_SIZE);
  writeText(bytes, 0x000, 16, sc1.title);
  writeText(bytes, 0x010, 60, sc1.menuLine);
  writeBlock(bytes, 0x04c, sc1.alliance);
  writeBlock(bytes, 0x066, sc1.hierarchy);
  writeText(bytes, 0x080, 840, sc1.description);
  return bytes;
}
