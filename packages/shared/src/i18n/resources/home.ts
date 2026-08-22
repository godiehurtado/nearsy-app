export default {
  greeting: 'Hello, {{name}}',
  visibility: {
    active: 'Active',
    inactive: 'Inactive',
    activeHint: 'You are visible to nearby users',
    inactiveHint: 'You are hidden from nearby users',
  },
  discovery: {
    title: 'Discovery',
    cta: 'See who is near you',
    maxInterestsTitle: 'Interest limit',
    maxInterests: 'You can select up to 12 interests.',
  },
} as const;
