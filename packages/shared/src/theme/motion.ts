// Motion tokens — approved durations and easings (v1.1 Design Freeze).
import { Easing } from 'react-native';

export const duration = {
  ctaReveal: 350,
  markIn: 400,
  screenIn: 450,
  orbSwap: 500,
  themeSweep: 780,
  glowBreathe: 5400,
  glowBreatheSlow: 8000,
  radarPing: 4800,
  illustrationFloat: 9000,
};

export const easing = {
  // cubic-bezier(.3,.9,.2,1) — ThemeSweep
  sweep: Easing.bezier(0.3, 0.9, 0.2, 1),
  // cubic-bezier(.2,1.1,.3,1) — orb glyph swap
  orb: Easing.bezier(0.2, 1.1, 0.3, 1),
  // cubic-bezier(.2,1.3,.3,1) — check mark pop
  pop: Easing.bezier(0.2, 1.3, 0.3, 1),
  // cubic-bezier(.2,.9,.2,1) — screen entrance
  screen: Easing.bezier(0.2, 0.9, 0.2, 1),
  inOut: Easing.inOut(Easing.ease),
  out: Easing.out(Easing.ease),
};

export const pressScale = 0.975;
