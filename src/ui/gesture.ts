/** Three-finger pinch on the shell itself (home screen, switcher, chat). */
export class PinchDetector {
  private start = 0;

  constructor(target: Document | HTMLElement, onPinch: (direction: 'in' | 'out') => void) {
    const opts = { capture: true, passive: true } as const;
    target.addEventListener('touchstart', (e) => {
      const touches = (e as TouchEvent).touches;
      if (touches.length === 3) this.start = spread(touches);
    }, opts);
    target.addEventListener('touchmove', (e) => {
      const touches = (e as TouchEvent).touches;
      if (!this.start || touches.length < 3) return;
      const ratio = spread(touches) / this.start;
      if (ratio < 0.65 || ratio > 1.5) {
        this.start = 0;
        onPinch(ratio < 1 ? 'in' : 'out');
      }
    }, opts);
    target.addEventListener('touchend', (e) => {
      if ((e as TouchEvent).touches.length < 3) this.start = 0;
    }, opts);
  }
}

/** Mean distance of the touches from their centroid. */
export function spread(touches: TouchList): number {
  const list = Array.from(touches);
  const cx = list.reduce((sum, t) => sum + t.clientX, 0) / list.length;
  const cy = list.reduce((sum, t) => sum + t.clientY, 0) / list.length;
  return list.reduce((sum, t) => sum + Math.hypot(t.clientX - cx, t.clientY - cy), 0) / list.length;
}
