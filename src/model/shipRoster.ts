import type { Faction } from './types';

export type ShipRole = string;

export interface ShipDefinition {
  role: string;
  name: string;
  cost: number;
  crew: number;
  /** Ignores enemy fortifications (SC1 ship flag 0x1000, the Arilou's alone). */
  passesFortifications?: boolean;
  /**
   * Besieges at about 33% instead of 10%, and smashes an enemy fortification on its own
   * (SC1 ship flag 0x2000, the Ur-Quan's alone).
   */
  breaksFortifications?: boolean;
}

export const SHIP_ROSTER: Record<Faction, ShipDefinition[]> = {
  alliance: [
    { role: 'shofixti-scout', name: 'Shofixti Scout', cost: 5, crew: 6 },
    { role: 'earthling-cruiser', name: 'Earthling Cruiser', cost: 9, crew: 18 },
    { role: 'syreen-penetrator', name: 'Syreen Penetrator', cost: 12, crew: 12 },
    { role: 'arilou-skiff', name: 'Arilou Skiff', cost: 16, crew: 6, passesFortifications: true },
    { role: 'mmrnmhrm-x-form', name: 'Mmrnmhrm X-Form', cost: 19, crew: 20 },
    { role: 'yehat-terminator', name: 'Yehat Terminator', cost: 23, crew: 20 },
    { role: 'chenjesu-broodhome', name: 'Chenjesu Broodhome', cost: 26, crew: 36 },
  ],
  hierarchy: [
    { role: 'umgah-drone', name: 'Umgah Drone', cost: 7, crew: 10 },
    { role: 'ilwrath-avenger', name: 'Ilwrath Avenger', cost: 10, crew: 22 },
    { role: 'vux-intruder', name: 'VUX Intruder', cost: 12, crew: 20 },
    { role: 'androsynth-guardian', name: 'Androsynth Guardian', cost: 15, crew: 20 },
    { role: 'spathi-eluder', name: 'Spathi Eluder', cost: 18, crew: 30 },
    { role: 'mycon-podship', name: 'Mycon Podship', cost: 23, crew: 20 },
    { role: 'ur-quan-dreadnought', name: 'Ur-Quan Dreadnought', cost: 30, crew: 42, breaksFortifications: true },
  ],
};

export function getShipDefinition(owner: Faction, role: string): ShipDefinition {
  const def = SHIP_ROSTER[owner].find((d) => d.role === role);
  if (!def) throw new Error(`Unknown ship role "${role}" for ${owner}`);
  return def;
}

export function shipTypeName(owner: Faction, role: string): string {
  return getShipDefinition(owner, role).name;
}

/** The roster entry a ship was built from, by its class name. */
export function definitionOfShip(owner: Faction, typeName: string): ShipDefinition | undefined {
  return SHIP_ROSTER[owner].find((d) => d.name === typeName);
}
