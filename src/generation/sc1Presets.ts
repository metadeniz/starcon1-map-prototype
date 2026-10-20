import type { Sc1Scenario } from './sc1Scenario';

// The settings of Star Control 1's nine built-in scenarios (SCENARIO.1-9), read from the original
// files. Only the numbers, titles and menu lines are bundled; loading the original file also
// shows its description.
export const SC1_PRESETS: Sc1Scenario[] = [
  {
    file: 'SCENARIO.1',
    title: "Beginner's Luck",
    menuLine: 'A lone Syreen must prevent Androsynth deployment.',
    description: '',
    alliance: { starbase: false, ships: [5, 0, 0, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x18, starbucks: 0, noBuild: 0x00, worlds: [6, 6, 6, 0, 0, 0, 0] },
    hierarchy: { starbase: true, ships: [4, 4, 0, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 2, noBuild: 0x00, worlds: [3, 6, 0, 1, 0, 0, 0] },
  },
  {
    file: 'SCENARIO.2',
    title: 'First Encounter',
    menuLine: 'When spheres of influence meet, battle is inevitable.',
    description: '',
    alliance: { starbase: true, ships: [3, 4, 6, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x08, starbucks: 10, noBuild: 0x00, worlds: [0, 6, 6, 1, 0, 1, 0] },
    hierarchy: { starbase: true, ships: [3, 4, 6, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 10, noBuild: 0x00, worlds: [0, 6, 6, 1, 0, 1, 0] },
  },
  {
    file: 'SCENARIO.3',
    title: 'Exterminate!',
    menuLine: 'The Hierarchy must curb rampant Shofixti breeding!',
    description: '',
    alliance: { starbase: true, ships: [7, 7, 7, 7, 7, 7, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x18, starbucks: 0, noBuild: 0x3f, worlds: [6, 6, 6, 3, 0, 0, 0] },
    hierarchy: { starbase: false, ships: [1, 0, 0, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x02, starbucks: 0, noBuild: 0x00, worlds: [4, 6, 1, 0, 1, 0, 0] },
  },
  {
    file: 'SCENARIO.4',
    title: 'Escalation',
    menuLine: 'A war of production.',
    description: '',
    alliance: { starbase: true, ships: [0, 0, 0, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 25, noBuild: 0x00, worlds: [5, 10, 5, 0, 0, 0, 0] },
    hierarchy: { starbase: true, ships: [0, 0, 0, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 25, noBuild: 0x00, worlds: [5, 10, 5, 0, 0, 0, 0] },
  },
  {
    file: 'SCENARIO.5',
    title: 'The Art of War',
    menuLine: "Match your strength against your enemy's weakness.",
    description: '',
    alliance: { starbase: true, ships: [4, 4, 5, 5, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x01, starbucks: 10, noBuild: 0x67, worlds: [5, 5, 5, 0, 0, 0, 0] },
    hierarchy: { starbase: true, ships: [2, 4, 4, 2, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x01, starbucks: 10, noBuild: 0x75, worlds: [5, 5, 5, 0, 0, 0, 0] },
  },
  {
    file: 'SCENARIO.6',
    title: 'Onslaught',
    menuLine: 'The Ur-Quan Offensive begins!',
    description: '',
    alliance: { starbase: true, ships: [6, 4, 2, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x18, starbucks: 30, noBuild: 0x00, worlds: [0, 6, 2, 6, 0, 3, 0] },
    hierarchy: { starbase: false, ships: [1, 1, 1, 1, 1, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 0, noBuild: 0x00, worlds: [4, 4, 4, 0, 0, 0, 0] },
  },
  {
    file: 'SCENARIO.7',
    title: 'Total War',
    menuLine: 'Two full fleets face off in a battle to the death!',
    description: '',
    alliance: { starbase: false, ships: [1, 2, 3, 4, 5, 6, 7], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 0, noBuild: 0x00, worlds: [5, 0, 15, 0, 0, 0, 0] },
    hierarchy: { starbase: false, ships: [1, 2, 3, 4, 5, 6, 7], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 0, noBuild: 0x00, worlds: [5, 0, 15, 0, 0, 0, 0] },
  },
  {
    file: 'SCENARIO.8',
    title: 'Proving Ground',
    menuLine: 'The Spathi fleet meets the Mmrnmhrm in deep space.',
    description: '',
    alliance: { starbase: true, ships: [3, 3, 3, 0, 0, 0, 0], zones: [2, 0, 0, 0, 0, 0, 0], flags: 0x08, starbucks: 0, noBuild: 0x00, worlds: [5, 4, 2, 3, 1, 4, 0] },
    hierarchy: { starbase: true, ships: [3, 3, 3, 3, 0, 0, 0], zones: [0, 0, 1, 1, 0, 0, 0], flags: 0x04, starbucks: 14, noBuild: 0x7a, worlds: [10, 5, 4, 0, 0, 0, 0] },
  },
  {
    file: 'SCENARIO.9',
    title: 'Counter Attack',
    menuLine: 'The Alliance strikes back!',
    description: '',
    alliance: { starbase: true, ships: [1, 0, 0, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 35, noBuild: 0x00, worlds: [6, 4, 8, 0, 0, 0, 0] },
    hierarchy: { starbase: true, ships: [2, 5, 7, 0, 0, 0, 0], zones: [0, 0, 0, 0, 0, 0, 0], flags: 0x00, starbucks: 0, noBuild: 0x00, worlds: [3, 4, 2, 4, 0, 4, 0] },
  },
];
