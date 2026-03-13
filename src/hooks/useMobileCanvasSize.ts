import { useEffect, useState } from 'react';

interface MobileCanvasSizeOptions {
  width: number;
  height: number;
  horizontalPadding?: number;
  reservedVerticalSpace?: number;
  maxWidth?: number;
}

/**
 * Read env(safe-area-inset-bottom) by temporarily injecting a zero-size
 * element with that padding, then reading it back via getComputedStyle.
 * Returns 0 on browsers/environments that don't support the env() function.
 */
function getSafeAreaInsetBottom(): number {
  try {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;pointer-events:none;width:0;height:0;' +
      'padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(el);
    const value = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    document.body.removeChild(el);
    return value;
  } catch {
    return 0;
  }
}

export function useMobileCanvasSize({
  width,
  height,
  horizontalPadding = 20,
  reservedVerticalSpace = 250,
  maxWidth = 410,
}: MobileCanvasSizeOptions) {
  const [size, setSize] = useState({ width, height, scale: 1 });

  useEffect(() => {
    const update = () => {
      const safeBottom = getSafeAreaInsetBottom();
      const availableWidth = Math.max(220, Math.min(window.innerWidth, maxWidth) - horizontalPadding);
      const availableHeight = Math.max(220, window.innerHeight - reservedVerticalSpace - safeBottom);
      const scale = Math.min(availableWidth / width, availableHeight / height);
      setSize({
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        scale,
      });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [height, horizontalPadding, maxWidth, reservedVerticalSpace, width]);

  return size;
}
