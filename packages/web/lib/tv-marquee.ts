/** Shift (px) to reveal clipped TV poster text. 0 means it already fits. */
export function tvMarqueeShiftPx(clientWidth: number, scrollWidth: number): number {
  if (!(clientWidth > 0) || !(scrollWidth > 0)) return 0;
  const shift = clientWidth - scrollWidth;
  return shift < -1 ? shift : 0;
}

export function measureTvMarqueeShift(
  container: HTMLElement,
  textEl: HTMLElement = container,
): number {
  return tvMarqueeShiftPx(container.clientWidth, textEl.scrollWidth);
}
