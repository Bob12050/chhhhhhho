/**
 * Palettes for placeholder art. Each ramp has 3-4 shade steps (outline +
 * shadow + mid + light), per ART_SPEC.md. Colors are CSS hex strings.
 */
export interface Ramp {
  readonly outline: string;
  readonly shadow: string;
  readonly mid: string;
  readonly light: string;
}

export interface ActorPalette {
  readonly skin: Ramp;
  readonly hair: Ramp;
  readonly cloth: Ramp; // base tunic
}

export const ramp = (outline: string, shadow: string, mid: string, light: string): Ramp => ({
  outline,
  shadow,
  mid,
  light,
});

export const PALETTES = {
  // Player base body
  player: {
    skin: ramp('#3a2418', '#a9663f', '#d68a5b', '#f0b483'),
    hair: ramp('#1c1230', '#3d2a63', '#5b3f8f', '#7a57b8'),
    cloth: ramp('#10202e', '#1f4458', '#2f6a82', '#4a93ad'),
  } as ActorPalette,
  // Slime enemy
  slime: {
    skin: ramp('#0e3a1e', '#1d6e38', '#2fa455', '#5fd47f'),
    hair: ramp('#0e3a1e', '#1d6e38', '#2fa455', '#5fd47f'),
    cloth: ramp('#0e3a1e', '#1d6e38', '#2fa455', '#5fd47f'),
  } as ActorPalette,
} as const;

// Equipment ramps (single ramp each; tinted variants come later via palette swap)
export const EQUIP_RAMPS = {
  leatherCap: ramp('#241405', '#5e3a13', '#8a5a22', '#b58044'),
  ironHelm: ramp('#1a1d24', '#444b58', '#6b7686', '#9aa6b8'),
  clothVest: ramp('#241010', '#5e2222', '#8a3636', '#b85a5a'),
  ironPlate: ramp('#1a1d24', '#444b58', '#6b7686', '#9aa6b8'),
  woodSword: ramp('#241405', '#5e3a13', '#8a5a22', '#b58044'),
  ironSword: ramp('#15171c', '#3a4250', '#7c8896', '#c2ccdc'),
} as const;
