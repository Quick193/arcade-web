import { useRef, useCallback } from 'react';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

interface UseSwipeOptions {
  onSwipe: (dir: SwipeDirection) => void;
  threshold?: number;
}

export function useSwipe({ onSwipe, threshold = 30 }: UseSwipeOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    startRef.current = null;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      onSwipe(dx > 0 ? 'right' : 'left');
    } else {
      onSwipe(dy > 0 ? 'down' : 'up');
    }
  }, [onSwipe, threshold]);

  return { onTouchStart, onTouchEnd };
}
