/** Distance from a point to a finite line segment. */
export function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function circleIntersectsLane(
  px: number,
  py: number,
  radius: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
): boolean {
  return pointToSegmentDistance(px, py, ax, ay, bx, by) <= radius + width / 2;
}
