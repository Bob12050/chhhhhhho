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
    ? insets.left + 44 * scale
    : width - insets.right - 44 * scale;
  const attackY = height - bottomPad - 44 * scale;
  const stickOnRight = leftHanded;
  const stickZoneX = stickOnRight ? width / 2 : 0;

  return {
    attack: { x: attackX, y: attackY },
    skill1: { x: attackX + 76 * scale * direction, y: attackY + 6 * scale },
    skill2: { x: attackX + 60 * scale * direction, y: attackY - 58 * scale },
    dodge: { x: attackX - 2 * scale * direction, y: attackY - 76 * scale },
    potion: { x: attackX + 64 * scale * direction, y: attackY - 122 * scale },
    potionCount: {
      x: attackX + 44 * scale * direction,
      y: attackY - 138 * scale,
    },
    stickZone: {
      x: stickZoneX,
      y: height * 0.45,
      width: width / 2,
      height: height * 0.55,
    },
    stickStandby: {
      x: stickOnRight
        ? width - insets.right - 60 * scale
        : insets.left + 60 * scale,
      y: attackY,
    },
  };
}
