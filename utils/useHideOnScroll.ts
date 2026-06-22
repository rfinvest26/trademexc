import { useEffect, useRef, useState } from 'react';

type UseHideOnScrollOptions = {
  /** Scroll container id. Default: root */
  scrollerId?: string;
  /** Threshold (px) below which we ignore micro scroll. Default: 6 */
  thresholdPx?: number;
  /** Always show when near top. Default: 8 */
  topRevealPx?: number;
};

/**
 * Returns `hidden` flag that becomes true when user scrolls down,
 * and false when user scrolls up. Designed for sticky top bars.
 *
 * Important: our app scrolls inside `#root`, not window.
 */
export function useHideOnScroll(options?: UseHideOnScrollOptions) {
  const scrollerId = options?.scrollerId ?? 'root';
  const thresholdPx = options?.thresholdPx ?? 6;
  const topRevealPx = options?.topRevealPx ?? 8;

  const [hidden, setHidden] = useState(false);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    const scroller = document.getElementById(scrollerId);
    if (!scroller) return undefined;

    const onScroll = () => {
      const y = scroller.scrollTop;
      const last = lastScrollTopRef.current;
      const delta = y - last;

      if (y <= topRevealPx) {
        setHidden(false);
      } else if (Math.abs(delta) >= thresholdPx) {
        setHidden(delta > 0);
      }

      lastScrollTopRef.current = y;
    };

    lastScrollTopRef.current = scroller.scrollTop;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollerId, thresholdPx, topRevealPx]);

  return hidden;
}

