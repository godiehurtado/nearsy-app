export default {
  title: 'Alignment',
  insufficient:
    "There isn't enough information yet to calculate alignment.",
  processing: 'Alignment is still being calculated.',
  unavailable: 'Alignment is currently unavailable.',
  tiers: {
    weak: 'Some overlap',
    partial: 'Shared ground',
    strong: 'Closely aligned',
    full: 'Rare alignment',
  },
  a11yScoreOnly: '{{score}} percent alignment',
  a11yWithTier: '{{score}} percent alignment, {{tier}}',
} as const;
