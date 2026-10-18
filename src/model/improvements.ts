import type { ImprovementType, Planet } from './types';

export const IMPROVEMENT_TYPES: ImprovementType[] = ['colony', 'mine', 'fortification'];

export const IMPROVEMENT_LABEL: Record<ImprovementType, string> = {
  colony: 'Colony',
  mine: 'Mine',
  fortification: 'Fortification',
};

export function isImprovementAllowed(planet: Planet, type: ImprovementType): boolean {
  if (type === 'colony') return planet.type === 'life';
  if (type === 'mine') return planet.type === 'mineral';
  return true; // fortification: any planet type
}

// Bigger ships (more crew) build faster. Thresholds are set relative to the roster's crew
// range (roughly 6-42): the handful of largest ships finish in 1 turn, the smallest in 3.
export function buildDurationTurns(crew: number): 1 | 2 | 3 {
  if (crew >= 25) return 1;
  if (crew >= 15) return 2;
  return 3;
}
