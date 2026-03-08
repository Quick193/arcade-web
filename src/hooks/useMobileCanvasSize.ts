import { useEffect, useState } from 'react';

interface MobileCanvasSizeOptions {
  width: number;
  height: number;
  horizontalPadding?: number;
  reservedVerticalSpace?: number;
  maxWidth?: number;
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
      const availableWidth = Math.max(220, Math.min(window.innerWidth, maxWidth) - horizontalPadding);
      const availableHeight = Math.max(220, window.innerHeight - reservedVerticalSpace);
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
