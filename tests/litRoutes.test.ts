import { describe, expect, it } from 'vitest';
import { litConnectionKeys } from '../src/render/canvasRenderer';
import type { ReachablePlanet } from '../src/game/gameState';

const reach = (entries: [string, number, string[]][]) =>
  new Map<string, ReachablePlanet>(entries.map(([planetId, cost, path]) => [planetId, { planetId, cost, path }]));

describe('litConnectionKeys', () => {
  // A square A-B-D and A-C-D, plus B-C across the middle and D-E beyond range.
  const connections = [
    { a: 'A', b: 'B' },
    { a: 'A', b: 'C' },
    { a: 'B', b: 'D' },
    { a: 'D', b: 'C' },
    { a: 'B', b: 'C' },
    { a: 'D', b: 'E' },
  ];

  it('lights nothing without a selection', () => {
    expect(litConnectionKeys(connections, undefined).size).toBe(0);
  });

  it('lights only the routes one step out from the starting planet', () => {
    const reachable = reach([
      ['B', 1, ['A', 'B']],
      ['C', 1, ['A', 'C']],
      ['D', 2, ['A', 'B', 'D']],
    ]);
    expect([...litConnectionKeys(connections, reachable)].sort()).toEqual(['A|B', 'A|C']);
  });
});
