import { generateGalaxy } from './generation/galaxyGenerator';
import { DEFAULT_SCENARIO } from './generation/scenarioConfig';
import { computeViewTransform, render, type ViewTransform } from './render/canvasRenderer';
import { renderInfoPanel } from './render/infoPanel';
import { handleCanvasClick, refreshAfterEndTurn, selectShip, startMovingStarbase, type Selection } from './ui/inputHandler';
import { buildShip, endTurn, InvalidActionError, startConstruction } from './game/gameState';
import { runAiTurn } from './game/ai';
import type { Faction, GameState, ImprovementType } from './model/types';
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
  turnLabel.textContent = `Turn ${state.turn} — ${FACTION_LABEL[state.humanFaction]} (you)`;
  starbucksBar.textContent = `Alliance: ${state.starbucks.alliance} | Hierarchy: ${state.starbucks.hierarchy} Starbucks`;
}

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
  while (state.currentFaction !== state.humanFaction) {
    runAiTurn(state, state.currentFaction);
    endTurn(state);
  }
}

function startGame(humanFaction: Faction): void {
  state = generateGalaxy(DEFAULT_SCENARIO, humanFaction);
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
  if (!state) return;
  endTurn(state);
  playAiTurnsUntilHuman();
  refreshAfterEndTurn(state, selection);
  draw();
});

newGameBtn.addEventListener('click', () => {
  state = null;
  factionPicker.classList.remove('hidden');
});

pickAllianceBtn.addEventListener('click', () => startGame('alliance'));
pickHierarchyBtn.addEventListener('click', () => startGame('hierarchy'));

window.addEventListener('resize', resize);
