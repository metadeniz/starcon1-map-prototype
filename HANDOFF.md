# Handoff: Star Control 1 clone (web, TypeScript + Canvas)

## Origin and caveat
The user's opening request was only "Let's work on a Star Control 1 clone." The Vite/TS/Vitest project scaffold was in a plan they approved, but they never explicitly asked for a code project. They have since asked "did I ask you to turn this into a project?" and have NOT yet said whether to keep, shrink, or discard it. Ask what they want before making large changes. Do not delete anything without their say-so. Do not commit to git unless asked (the folder is not a git repo).

## Environment
- Project dir: `G:\My Drive\Game - Starcon1 clone` (earlier work was at `C:\Users\Deniz\Dropbox\Game - Starcon1 clone`; the files are now under G:).
- Windows, PowerShell. Node.js 24 was installed via winget with the user's OK. The harness's PATH can be stale, so in PowerShell run: `$env:PATH = [Environment]::GetEnvironmentVariable("PATH","Machine")+";"+[Environment]::GetEnvironmentVariable("PATH","User")` before `npm`/`npx`.
- Commands: `npx tsc -b` (typecheck), `npx vitest run` (tests), `npm run build`, `npm run dev` (Vite on :5173).
- `.claude/launch.json` + `.claude/dev-server.cmd` start the dev server for the preview pane (they set PATH because the harness can't find node). Clutter to remove: `vite.config.ts.timestamp-*.mjs`, `dist/`, `tsconfig.tsbuildinfo`.
- Last state: 72 tests passed and typecheck was clean. The final browser verification was interrupted (see "Unverified").

## Game design (as specified by the user)
- Strategic layer of SC1: custom design, not a port. Planets are nodes in a connection graph; each jump = 1 movement point; each ship has 3 move points per turn.
- 2 sides: Alliance of Free Stars vs Hierarchy of Battle Thralls. **Hierarchy is always on top, Alliance on the bottom.** Human picks a side at game start; the AI takes the other.
- Alternating turns. The human goes first. A "round" (turn counter, construction progress, mine income) completes only when control returns to the human.
- Planet types: life, mineral, dead. Unexplored planets render blue until a ship visits them (fog of war; every planet on a ship's path is revealed).
- Map: default **30 planets** (`ScenarioConfig.totalPlanets`, 2-50), split evenly; an odd one goes to the Hierarchy. Generated with Star Control 1's own cluster algorithm (reverse-engineered from STARCON.EXE), moved to 2D. The first star sits at the exact centre, and the sides then take turns placing stars by rejection sampling in their own half. Links are exactly the pairs 20-38 units apart, with no unlinked pair 38-60 apart nearby, at most 3 links per new star and 4 per star. The field is larger than SC1's and grows with the star count, so link and dead-end counts match SC1's 3D maps. Planet types are an exact per-side deck from `planetTypeWeights`, shuffled. No planet names on the map (names only in the side panel).
- Each side has a homeworld (life world with starbase) on the star farthest from the centre on its side (SC1's starbase rule), starting with 3 ships (Alliance: 2 Shofixti Scout + Earthling Cruiser; Hierarchy: 2 Umgah Drone + Ilwrath Avenger).
- Economy: currency is "Starbucks" (the user confirmed the name). Starting 25 each. Ships are built at an owned starbase for Starbucks. Mines give +3 Starbucks per round to their owner.
- Improvements (colony on life, mine on mineral, fortification anywhere): **free, take time**. The ordering ship must stay on the planet for the whole build or it is cancelled. Duration depends on that ship's crew: >=25 -> 1 turn, >=15 -> 2, else 3 (bigger = faster). A planet only becomes owned once an improvement completes.
- Ships are individual units (no fleets). Each has its own icon on the map, selection, and order menu. Each ship shows crew `current/max`; current crew is meant to drop with future combat damage.
- Ship rosters (name, cost, crew), sorted by cost:
  - Alliance: Shofixti Scout 5/6, Earthling Cruiser 9/18, Syreen Penetrator 12/12, Arilou Skiff 16/6, Mmrnmhrm X-Form 19/20, Yehat Terminator 23/20, Chenjesu Broodhome 26/36.
  - Hierarchy: Umgah Drone 7/10, Ilwrath Avenger 10/22, VUX Intruder 12/20, Androsynth Guardian 15/20, Spathi Eluder 18/30, Mycon Podship 23/20, Ur-Quan Dreadnought 30/42.
- A "New Game" button resets and should re-open the faction picker.

## Code map (`src/`)
- `model/types.ts`: Planet, Ship (crew, currentCrew, planetId, movesRemaining), GameState (ships, humanFaction, currentFaction, starbucks, turn), ScenarioConfig.
- `model/shipRoster.ts`: per-faction ship definitions. `model/improvements.ts`: eligibility and `buildDurationTurns`. `model/id.ts`: shared id generator.
- `generation/`: `galaxyGenerator.ts` (`generateGalaxy(scenario, humanFaction, seed?)`), `sc1Cluster.ts` (SC1 cluster rules in 2D), `layout.ts` (logical canvas bounds), `scenarioConfig.ts` (`DEFAULT_SCENARIO`), `rng.ts`, `planetNames.ts`.
- `game/gameState.ts`: `reachablePlanets`, `moveShip`, `startConstruction(shipId, type, state)`, `buildShip`, `endTurn`, `otherFaction`. Actions throw `InvalidActionError` if it isn't that side's turn. `game/ai.ts`: `runAiTurn` (simple heuristic: ships claim/expand to the nearest non-owned planet, start builds on eligible ground, and the starbase buys the best affordable ship).
- `render/canvasRenderer.ts` (planets, edges, per-ship icons in a ring around the planet, hit-testing), `render/infoPanel.ts` (planet info, ship list with crew, orders, build-ship buttons; only the human's own units are actionable), `ui/inputHandler.ts` (selection and click-to-move), `main.ts` (wiring, faction picker, AI turn after End Turn).
- `index.html`: all CSS, sidebar, `#faction-picker` overlay (shown on load; `hidden` class once a side is chosen).
- `tests/`: `gameState.test.ts`, `galaxyGenerator.test.ts`, `ai.test.ts`.

## Unverified / known issues
1. **Faction picker**: the last browser check showed the game already running ("Turn 1 - Alliance (you)") and `#faction-picker` already had class `hidden` on a fresh navigate. That should not happen, because `state` starts null and only `startGame()` adds `hidden`. Possible stale page/HMR state, or a bug. I was about to click New Game when the session ended. Reproduce with a hard reload and check that the picker shows on load, that picking a side starts the game, and that New Game re-shows it.
2. The AI has not been watched playing in the browser, only smoke-tested in `ai.test.ts`.
3. Browser-pane screenshots often fail when the pane is hidden, and coordinate clicks are unreliable (viewport vs screenshot scale). Use `read_page` refs to click.

## Not built / deferred
Combat and damage, win conditions, building additional starbases, any use of crew beyond display and build speed, a smarter AI, planet art (the user said the planet-texture reference image was for layout only, not style).
