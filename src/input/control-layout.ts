export interface ControlPoint {
  x: number;
  y: number;
}

export interface ControlLayout {
  attack: ControlPoint;
  skill1: ControlPoint;
  skill2: ControlPoint;
  dodge: ControlPoint;
  potion: ControlPoint;
  potionCount: ControlPoint;
  stickZone: { x: number; y: number; width: number; height: number };
  stickStandby: ControlPoint;
}

/** Pure layout math shared by the HUD and tests. */
export function buildControlLayout(
  width: number,
  height: number,
  bottomPad: number,
  insets: { left: number; right: number },
  controlScale: number,
  leftHanded: boolean,
): ControlLayout {
  const scale = Math.max(0.85, Math.min(1.2, controlScale));
  const direction = leftHanded ? 1 : -1;
  const attackX = leftHanded
    ? insets.left + 66 * scale
    : width - insets.right - 66 * scale;
  const attackY = height - bottomPad - 70 * scale;
  const stickOnRight = leftHanded;
  const stickZoneX = stickOnRight ? width / 2 : 0;

  return {
    attack: { x: attackX, y: attackY },
    skill1: { x: attackX + 54 * scale * direction, y: attackY - 62 * scale },
    skill2: { x: attackX + 4 * scale * direction, y: attackY - 106 * scale },
    dodge: { x: attackX + 70 * scale * direction, y: attackY - 118 * scale },
    potion: { x: attackX + 8 * scale * direction, y: attackY - 164 * scale },
    potionCount: {
      x: attackX + 28 * scale * direction,
      y: attackY - 180 * scale,
    },
    stickZone: {
      x: stickZoneX,
      y: height * 0.45,
      width: width / 2,
      height: height * 0.55,
    },
    stickStandby: {
      x: stickOnRight
        ? width - insets.right - 68 * scale
        : insets.left + 68 * scale,
      y: attackY - 24 * scale,
    },
  };
}
