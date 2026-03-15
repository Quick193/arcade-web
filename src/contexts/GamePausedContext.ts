import { createContext } from 'react';

/** True when the Hub pause sheet is visible — useGameLoop reads this to freeze all canvas loops. */
export const GamePausedContext = createContext(false);
export let isGlobalPaused = false;

// Global event target for games that cannot consume Context due to component tree structure.
export const gamePauseEventTarget = new EventTarget();

export function setGlobalPauseActive(isPaused: boolean) {
  isGlobalPaused = isPaused;
  gamePauseEventTarget.dispatchEvent(new CustomEvent('globalPause', { detail: { isPaused } }));
}
