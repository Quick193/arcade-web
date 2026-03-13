/** Haptic feedback utilities — silently no-op on unsupported devices */
const ok = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Very short tap — for collecting items, button presses */
export function hapticLight(): void {
  if (ok) navigator.vibrate(8);
}

/** Medium pulse — for line clears, scoring events */
export function hapticMedium(): void {
  if (ok) navigator.vibrate(30);
}

/** Strong burst — for game-over, deaths */
export function hapticHeavy(): void {
  if (ok) navigator.vibrate([60, 40, 80]);
}

/** Double-tap pattern — for achievements, special events */
export function hapticSuccess(): void {
  if (ok) navigator.vibrate([30, 60, 100]);
}
