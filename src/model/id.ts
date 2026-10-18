let counter = 0;

/** App-wide unique id generator, shared by galaxy generation and in-game actions. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
