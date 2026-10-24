export default {
  errors: {
    title: 'Profile',
    generic: "We couldn't switch profiles. Please try again.",
    networkUnavailable:
      'Unable to switch profiles. Check your connection and try again.',
  },
  incomplete: {
    message: 'Complete this profile before becoming visible again.',
    switchBlocked:
      'Complete the required fields before switching to this profile.',
    keepEditing:
      'You can keep editing this profile. It stays inactive until it is complete.',
  },
} as const;
