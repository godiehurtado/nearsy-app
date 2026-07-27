export default {
  introVideo: {
    title: 'Welcome to Nearsy',
    subtitle: 'Create your account and start connecting with people around you.',
    stepEmail: 'Add your email and password',
    stepBirthYear: 'Confirm your birth year',
    stepTerms: 'Accept terms and finish setting up your profile',
    startRegistration: 'Start registration',
    alreadyMember: 'Already part of Nearsy?',
    signIn: 'Sign in',
    back: 'Back',
    skip: 'Skip',
    continue: 'Continue',
  },
  completeProfile: {
    title: 'Complete your profile',
    subtitle: 'Tell people a little about yourself',
  },
  profileCompletion: {
    continue: 'Continue',
    backA11y: 'Back',
    saveErrorTitle: 'Could not save',
    saveErrorMessage: 'Please try again. Your progress is still here.',
    type: {
      title: 'How will you use Nearsy?',
      subtitle: 'You can switch anytime later from your profile.',
      personalTitle: 'Personal',
      personalBody:
        'Meet people nearby – hobbies and genuine connections.',
      professionalTitle: 'Professional',
      professionalBody:
        'Showcase your company and grow your network.',
      chooseRequired: 'Choose Personal or Professional to continue',
    },
    info: {
      title: 'Add a profile photo',
      subtitle:
        'Show your best self. You can take one now or upload from your gallery.',
      photoRequired: 'A profile photo is required to continue',
      takePhoto: 'Take photo',
      uploadPhoto: 'Upload',
    },
    interests: {
      title: 'What are you into?',
      subtitle: 'Pick a few — helps us find your people. ({{count}} selected)',
      pickRequired: 'Pick at least one interest to continue',
      catalogErrorTitle: 'Interests unavailable',
      catalogErrorMessage:
        'We could not load interests right now. Check your connection and try again.',
      catalogRetry: 'Try again',
    },
    location: {
      title: 'Turn on location',
      subtitle:
        "Nearsy shows you people who are actually close by. Without location we can't do that.",
      enable: 'Enable location',
      skip: 'Skip for now',
      deniedTitle: 'Location not enabled',
      deniedMessage:
        'You can turn it on later in Settings. You can still continue.',
    },
    notifications: {
      title: 'Stay in the loop',
      subtitle:
        'Get notified when someone interesting is nearby or messages you.',
      enable: 'Enable notifications',
      skip: 'Skip for now',
      deniedTitle: 'Notifications not enabled',
      deniedMessage:
        'You can enable them later in Settings. You can still continue.',
    },
    success: {
      title: "You're all set",
      subtitle:
        'Your profile is ready. Start exploring people around you.',
      startExploring: 'Start Exploring',
      modeLabel: 'Starting as {{mode}}',
      modePersonal: 'Personal',
      modeProfessional: 'Professional',
    },
  },
} as const;
