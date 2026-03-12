import { createContext } from 'react';

/** True when the Hub pause sheet is visible — useGameLoop reads this to freeze all canvas loops. */
export const GamePausedContext = createContext(false);
