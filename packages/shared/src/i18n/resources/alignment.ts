export default {
  title: 'Alignment',
  unavailable: 'Alignment is being prepared.',
  tiers: {
    weak: 'Some overlap',
    partial: 'Shared ground',
    strong: 'Closely aligned',
    full: 'Rare alignment',
  },
  a11yScoreOnly: '{{score}} percent alignment',
  a11yWithTier: '{{score}} percent alignment, {{tier}}',
} as const;
