import { useCallback, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { playSfx, type SfxId } from '../utils/sfx';

/**
 * Returns a stable `sfx(id)` function that respects the user's SFX setting.
 * Safe to call from RAF game loops via a ref.
 */
export function useSfx() {
  const { state } = useApp();
  const enabledRef = useRef(state.settings.sfxEnabled);
  enabledRef.current = state.settings.sfxEnabled;

  return useCallback((id: SfxId) => {
    playSfx(id, enabledRef.current);
  }, []); // stable — reads enabledRef at call time
}
