/** Design tokens. Names match the design system; do not add colours without a token name. */
export const colors = {
  lensInk: '#0D0E0C',
  lensSurface: '#191B18',
  formPaper: '#D9E2DE',
  stampIndigo: '#2C3E8F', // civic rail (topping)
  worklightAmber: '#C77A16', // worker marketplace: the brand colour
  stampGreen: '#2F6B4F', // verified, on duty
  registerRed: '#A82A22', // disputes, SLA breach

  // Derived neutrals: text on each world, and the ruled lines of the paper.
  onLens: '#E6E9E4',
  onLensMuted: '#9A9F97',
  onPaper: '#14171A',
  onPaperMuted: '#4C5658',
  paperRule: '#9FB0AB',
  paperRaised: '#E7EDEA',
} as const;

export const space = { xs: 4, sm: 8, md: 14, lg: 20, xl: 32 } as const;
export const radius = { sm: 4, md: 8, lg: 14 } as const;

/** Minimum touch target. Users may be first-time smartphone users; nothing tappable is smaller. */
export const touch = 52;
