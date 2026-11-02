export default {
  title: 'Alignment',
  insufficient:
    "There isn't enough information yet to calculate alignment.",
  processing: 'Alignment is still being calculated.',
  unavailable: 'Alignment is currently unavailable.',
  // Tier classifications are not shown in UI or a11y (percent + title only).
  tiers: {
    weak: '',
    partial: '',
    strong: '',
    full: '',
  },
  a11yScoreOnly: '{{score}} percent alignment',
  a11yWithTier: '{{score}} percent alignment',
} as const;
