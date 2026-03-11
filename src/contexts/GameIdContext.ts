import { createContext } from 'react';

/** Provides the game ID for the currently rendered GameScreen instance.
 *  Consumed by useGameLoop (to auto-pause when inactive) and GameWrapper (to know its own game ID). */
export const GameIdContext = createContext<string>('');
