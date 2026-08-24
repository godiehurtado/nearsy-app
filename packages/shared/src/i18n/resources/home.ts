export default {
  greeting: 'Hello, {{name}}',
  brand: 'Nearsy',
  accountStatus: 'Your account is',
  controlHint: 'You control when you are visible to others.',
  findPeopleTitle: 'Find interesting people nearby?',
  findPeopleBody:
    'Browse temporary profiles of others to facilitate meaningful in-person connections.',
  modePreferences: '{{mode}} preferences',
  modePersonal: 'Personal',
  modeProfessional: 'Professional',
  visibility: {
    active: 'Active',
    inactive: 'Inactive',
    activeHint: 'You are visible to nearby users',
    inactiveHint: 'You are hidden from nearby users',
  },
  preferences: {
    ageRange: 'Age range',
    ageRangeHint: 'Choose the age range of people you want to discover.',
    ageValue: '{{min}}–{{max}}',
    distanceRange: 'Search range',
    distanceValueFt: 'up to {{value}} ft',
    distanceValueM: 'up to {{value}} m',
  },
  discovery: {
    title: 'Discovery',
    cta: 'See who is near you',
    disabledReason: 'Turn on Visibility to start Discovery.',
    maxInterestsTitle: 'Interest limit',
    maxInterests: 'You can select up to 12 interests.',
    interestsTitle: 'Interests to match',
    interestsHint: 'Only show people who share what you pick.',
    interestsCounter: '{{count}}/{{max}}',
    anyInterest: 'Any interest',
    interestsSearchPlaceholder: 'Search interests, categories…',
    clearSearch: 'Clear search',
    interestsNoResults: 'No interests match your search.',
  },
  errors: {
    title: 'Visibility',
    generic: 'Could not update Visibility. Please try again.',
    retry: 'Activation failed. Pull to refresh and try again.',
    profileIncomplete:
      'Complete your profile before turning on Visibility.',
    invalidLocation:
      'Location accuracy is too low. Move outdoors and try again.',
    unauthenticated: 'Sign in again to use Visibility.',
    permissionDenied: 'Location permission is required for Visibility.',
    visibilityInactive: 'Visibility is off. Turn it on to discover nearby people.',
    networkUnavailable:
      'Network unavailable. Check your connection and try again.',
  },
} as const;
