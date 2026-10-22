// SC1's menu sounds, rendered from STARCON.EXE's PC speaker effects (research/sc1-audio): effect
// 0x31 when the menu highlight moves and 0x32 when an option is selected. The speaker plays one
// effect at a time, so a new sound cuts off the one still playing, as it did in SC1.

export type MenuSound = 'move' | 'select';

const SOURCES: Record<MenuSound, string> = {
  move: new URL('../assets/sfx/menuMove.wav', import.meta.url).href,
  select: new URL('../assets/sfx/menuSelect.wav', import.meta.url).href,
};

let audio: AudioContext | undefined;
const buffers = new Map<MenuSound, AudioBuffer>();
let playing: AudioBufferSourceNode | undefined;

/** Creates the audio context and decodes the sounds. Browsers only allow this after a key press or click. */
function ensureAudio(): AudioContext | undefined {
  if (audio) return audio;
  if (typeof AudioContext === 'undefined') return undefined;
  audio = new AudioContext();
  for (const [name, url] of Object.entries(SOURCES) as [MenuSound, string][]) {
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => audio!.decodeAudioData(data))
      .then((buffer) => buffers.set(name, buffer))
      .catch((err) => console.warn(`Could not load the ${name} sound`, err));
  }
  return audio;
}

export function playMenuSound(name: MenuSound): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const buffer = buffers.get(name);
  if (!buffer) return;
  playing?.stop();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  playing = source;
}

/** Starts loading the sounds on the first key press or click, so the first menu sound isn't lost. */
export function preloadMenuSounds(): void {
  const unlock = () => {
    ensureAudio();
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('pointerdown', unlock, true);
  };
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('pointerdown', unlock, true);
}
