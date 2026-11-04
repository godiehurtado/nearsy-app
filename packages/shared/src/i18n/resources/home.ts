export default {
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
    locationConsentTitle: 'Allow location for Visibility?',
    locationConsentBody:
      'Nearsy collects your device location while you use the app to show people nearby and keep Visibility on. Location is sent securely to Nearsy for nearby discovery. You can turn Visibility off anytime.',
    locationConsentContinue: 'Continue',
    locationConsentCancel: 'Not now',
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
    preferencesTitle: 'Preferences',
    preferencesSave:
      'Could not save your discovery preferences. Please try again.',
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
