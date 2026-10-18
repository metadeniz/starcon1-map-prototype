import type { Rng } from './rng';
import { pick, randInt } from './rng';

const SYLLABLES_A = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gor', 'Hy', 'Il', 'Jax', 'Ka', 'Lor', 'Mor', 'Nyx', 'Or', 'Pyr', 'Quel', 'Ryn', 'Sol', 'Tor', 'Ul', 'Vex', 'Wyr', 'Xel', 'Yl', 'Zar'];
const SYLLABLES_B = ['us', 'ion', 'ara', 'eth', 'os', 'is', 'ael', 'oth', 'yr', 'ade', 'ora', 'ix', 'un', 'ell'];
const SUFFIXES = ['', ' Prime', ' Minor', ' Major', " II", " III", " IV"];

export function makePlanetNamer(rng: Rng) {
  const used = new Set<string>();
  return function nextName(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      const base = pick(rng, SYLLABLES_A) + pick(rng, SYLLABLES_B);
      const suffix = attempt < 20 ? SUFFIXES[0] : pick(rng, SUFFIXES);
      const name = base + suffix;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    // fallback: guaranteed-unique numbered name
    const name = `Star-${randInt(rng, 100000)}`;
    used.add(name);
    return name;
  };
}
