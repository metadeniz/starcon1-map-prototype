import { generateGalaxy } from './generation/galaxyGenerator';
import { DEFAULT_SCENARIO } from './generation/scenarioConfig';
import { computeViewTransform, render, type ViewTransform } from './render/canvasRenderer';
import { renderInfoPanel } from './render/infoPanel';
import { whenIconsLoaded } from './render/shipIcons';
import { handleCanvasClick, refreshAfterEndTurn, selectShip, startMovingStarbase, type Selection } from './ui/inputHandler';
import { buildShip, endTurn, InvalidActionError, startConstruction, winner } from './game/gameState';
import { SC1_PRESETS } from './generation/sc1Presets';
import { parseSc1Scenario, sc1ToScenarioConfig, ScenarioFileError } from './generation/sc1Scenario';
import { worldTotal } from './generation/galaxyGenerator';
import { shipTypeName } from './model/shipRoster';
import { runAiTurn } from './game/ai';
import type { Faction, GameState, ImprovementType, ScenarioConfig, SideSetup } from './model/types';
import type { ShipRole } from './model/shipRoster';

const FACTION_LABEL: Record<Faction, string> = {
  alliance: 'Alliance of Free Stars',
  hierarchy: 'Hierarchy of Battle Thralls',
};

const canvas = document.getElementById('galaxy-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const mapContainer = document.getElementById('map-container')!;
const infoPanel = document.getElementById('info-panel')!;
const turnLabel = document.getElementById('turn-label')!;
const starbucksBar = document.getElementById('starbucks-bar')!;
const endTurnBtn = document.getElementById('end-turn-btn') as HTMLButtonElement;
const newGameBtn = document.getElementById('new-game-btn') as HTMLButtonElement;
const factionPicker = document.getElementById('faction-picker')!;
const pickAllianceBtn = document.getElementById('pick-alliance') as HTMLButtonElement;
const pickHierarchyBtn = document.getElementById('pick-hierarchy') as HTMLButtonElement;
const scenarioSelect = document.getElementById('scenario-select') as HTMLSelectElement;
const loadScenarioBtn = document.getElementById('load-scenario-btn') as HTMLButtonElement;
const scenarioFileInput = document.getElementById('scenario-file') as HTMLInputElement;
const scenarioInfo = document.getElementById('scenario-info')!;
const scenarioError = document.getElementById('scenario-error')!;
const scenarioBar = document.getElementById('scenario-bar')!;

const scenarios: ScenarioConfig[] = [DEFAULT_SCENARIO, ...SC1_PRESETS.map(sc1ToScenarioConfig)];

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function selectedScenario(): ScenarioConfig {
  return scenarios[Number(scenarioSelect.value)] ?? DEFAULT_SCENARIO;
}

function refreshScenarioOptions(selectIndex: number): void {
  scenarioSelect.innerHTML = scenarios
    .map((sc, i) => `<option value="${i}">${escapeHtml(sc.title)}</option>`)
    .join('');
  scenarioSelect.value = String(selectIndex);
  renderScenarioInfo();
}

function victoryText(side: SideSetup): string {
  const parts = [
    side.victory.enemyHasNoShips && 'no ships',
    side.victory.enemyHasNoColonies && 'no colonies',
    side.victory.enemyHasNoMines && 'no mines',
  ].filter(Boolean);
  return parts.length
    ? `Wins when the enemy has ${parts.join(' and ')}, or nothing left`
    : 'Wins when the enemy has no ships and no starbase left';
}

function sideSummary(faction: Faction, side: SideSetup): string {
  const w = side.worlds;
  const worlds = [
    [w.dead, 'dead'],
    [w.mineral, 'mineral'],
    [w.life, 'life'],
    [w.colony, 'colony'],
    [w.fortifiedColony, 'fortified colony'],
    [w.mine, 'mine'],
    [w.fortifiedMine, 'fortified mine'],
  ]
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}`)
    .join(', ');
  const counts = new Map<string, number>();
  for (const ship of side.ships) counts.set(ship.role, (counts.get(ship.role) ?? 0) + 1);
  const ships = [...counts].map(([role, n]) => `${n}× ${shipTypeName(faction, role)}`).join(', ') || 'none';
  const cannotBuild = side.cannotBuild.map((role) => shipTypeName(faction, role)).join(', ');
  return `<tr><td>${FACTION_LABEL[faction]}</td><td>
    ${worldTotal(w)} worlds: ${worlds}<br>
    Starbase: ${side.starbase ? 'yes' : 'no'}. Ships: ${ships}<br>
    ${side.starbucks} Starbucks${cannotBuild ? `. Cannot build: ${cannotBuild}` : ''}<br>
    ${victoryText(side)}
  </td></tr>`;
}

function renderScenarioInfo(): void {
  const sc = selectedScenario();
  const firstMove = sc.firstMove ? `${FACTION_LABEL[sc.firstMove]} moves first.` : 'You move first.';
  scenarioInfo.innerHTML = `
    ${sc.menuLine ? `<div class="menu-line">${escapeHtml(sc.menuLine)}</div>` : ''}
    ${sc.description ? `<p>${escapeHtml(sc.description)}</p>` : ''}
    <table>${sideSummary('hierarchy', sc.sides.hierarchy)}${sideSummary('alliance', sc.sides.alliance)}</table>
    <div>${firstMove}</div>
  `;
}

async function loadScenarioFiles(files: FileList): Promise<void> {
  scenarioError.textContent = '';
  let last = -1;
  for (const file of Array.from(files)) {
    try {
      const sc1 = parseSc1Scenario(new Uint8Array(await file.arrayBuffer()), file.name);
      scenarios.push(sc1ToScenarioConfig(sc1));
      last = scenarios.length - 1;
    } catch (err) {
      if (!(err instanceof ScenarioFileError)) throw err;
      scenarioError.textContent = err.message;
    }
  }
  if (last >= 0) refreshScenarioOptions(last);
}

let state: GameState | null = null;
const selection: Selection = {};
let view: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };

function draw(): void {
  if (!state) return;
  render(ctx, state, view, {
    selectedPlanetId: selection.selectedPlanetId,
    selectedShipId: selection.selectedShipId,
    reachable: selection.reachable,
  });
  renderInfoPanel(infoPanel, state, selection.selectedPlanetId, selection.selectedShipId, selection.movingStarbaseFromPlanetId);
  const won = winner(state);
  turnLabel.textContent = won
    ? `${FACTION_LABEL[won]} wins!`
    : `Turn ${state.turn} — ${FACTION_LABEL[state.humanFaction]} (you)`;
  scenarioBar.textContent = `${state.scenario.title}. ${victoryText(state.scenario.sides[state.humanFaction])}.`;
  starbucksBar.textContent = `Alliance: ${state.starbucks.alliance} | Hierarchy: ${state.starbucks.hierarchy} Starbucks`;
}

// The SC1 map icons load asynchronously; redraw once they arrive.
whenIconsLoaded(draw);

function resize(): void {
  const rect = mapContainer.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  view = computeViewTransform(canvas.width, canvas.height);
  draw();
}

/** Runs the AI's turn(s) until control returns to the human, in case of any transient states. */
function playAiTurnsUntilHuman(): void {
  if (!state) return;
  while (state.currentFaction !== state.humanFaction && !winner(state)) {
    runAiTurn(state, state.currentFaction);
    endTurn(state);
  }
}

function startGame(humanFaction: Faction): void {
  state = generateGalaxy(selectedScenario(), humanFaction);
  selection.selectedPlanetId = undefined;
  selection.selectedShipId = undefined;
  selection.movingStarbaseFromPlanetId = undefined;
  selection.reachable = undefined;
  playAiTurnsUntilHuman();
  factionPicker.classList.add('hidden');
  resize();
}

canvas.addEventListener('click', (event) => {
  if (!state) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  handleCanvasClick(x, y, state, view, selection);
  draw();
});

infoPanel.addEventListener('click', (event) => {
  if (!state) return;
  const target = event.target as HTMLElement;
  if (target.tagName !== 'BUTTON') return;
  const action = target.dataset.action;
  if (!action) return;

  try {
    if (action === 'select-ship') {
      const shipId = target.dataset.ship;
      if (shipId) selectShip(shipId, state, selection);
    } else if (action === 'move-starbase') {
      const planetId = target.dataset.planet;
      if (planetId) startMovingStarbase(planetId, state, selection);
    } else if (action === 'start-construction') {
      const shipId = target.dataset.ship;
      const type = target.dataset.type as ImprovementType;
      if (shipId) startConstruction(shipId, type, state);
    } else if (action === 'build-ship') {
      const owner = target.dataset.owner as Faction;
      const planetId = target.dataset.planet;
      const role = target.dataset.role as ShipRole;
      if (owner && planetId) buildShip(owner, planetId, role, state);
    }
  } catch (err) {
    if (err instanceof InvalidActionError) {
      console.warn(err.message);
    } else {
      throw err;
    }
  }
  draw();
});

endTurnBtn.addEventListener('click', () => {
  if (!state || winner(state)) return;
  endTurn(state);
  playAiTurnsUntilHuman();
  refreshAfterEndTurn(state, selection);
  draw();
});

newGameBtn.addEventListener('click', () => {
  state = null;
  factionPicker.classList.remove('hidden');
});

scenarioSelect.addEventListener('change', renderScenarioInfo);
loadScenarioBtn.addEventListener('click', () => scenarioFileInput.click());
scenarioFileInput.addEventListener('change', () => {
  if (scenarioFileInput.files) void loadScenarioFiles(scenarioFileInput.files);
  scenarioFileInput.value = '';
});
refreshScenarioOptions(0);

pickAllianceBtn.addEventListener('click', () => startGame('alliance'));
pickHierarchyBtn.addEventListener('click', () => startGame('hierarchy'));

window.addEventListener('resize', resize);
