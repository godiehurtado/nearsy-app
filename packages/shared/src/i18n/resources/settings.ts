export default {
  title: 'Settings',
  sections: {
    account: 'Account',
    privacy: 'Privacy & discovery',
    preferences: 'Preferences',
    actions: 'Account actions',
  },
  email: {
    title: 'Email',
    missing: 'No email available',
  },
  phone: {
    title: 'Mobile number',
    hint: 'Your phone helps protect your account. Your number is never shown on your profile.',
    verified: 'Verified',
    notVerified: 'Not verified',
  },
  birthDate: {
    title: 'Date of birth',
    notSet: 'Not set',
    hint: 'Your date of birth is used for age-based discovery. You must be 18–99.',
    incomplete: 'Enter a complete date of birth.',
    invalid: 'Enter a valid calendar date.',
    tooYoung: 'You must be at least {{age}} years old.',
    tooOld: 'Age must be {{age}} or younger.',
    saved: 'Date of birth updated',
  },
  visibilityAge: {
    title: 'Who can find me by age',
    notSet: 'No age limit',
    minLabel: 'Hide me from users younger than',
    maxLabel: 'Hide me from users older than',
    hint: 'Leave blank to skip a limit. Allowed range is {{min}}–{{max}}.',
    minBounds: 'Minimum age must be between {{min}} and {{max}}.',
    maxBounds: 'Maximum age must be between {{min}} and {{max}}.',
    order: 'Minimum age cannot be greater than maximum age.',
    saved: 'Visibility age updated',
  },
  backgroundVisibility: {
    title: 'Stay visible in background',
    description:
      'Keep your location updated so others can discover you nearby even when the app is closed.',
    hint: 'Requires Always location permission. On iOS, a blue indicator may appear while Nearsy updates your location in the background.',
    enabled: 'Background visibility is on',
    disabledTitle: 'Background updates are off',
    disabled:
      'Nearsy will no longer update your location in the background. You can manage the system permission in iPhone Settings.',
    disabledDone: 'Done',
    unsupported: 'Background location is not available on web.',
    authRequired: 'Please log in again.',
    error: 'Could not update background location.',
    openSettings: 'Open Settings',
    needsAlwaysPermission:
      'Nearsy needs Always location access to stay visible in the background. Enable it in iOS Settings.',
    education: {
      full: {
        title: 'Stay discoverable nearby',
        body:
          'Nearsy can keep your location updated in the background while Visibility is on, so people who are truly nearby can find you even when the app is closed. Background location is not used when Visibility is off.',
      },
      brief: {
        title: 'Enable background location?',
        body:
          'Background updates keep you discoverable nearby while Visibility is on. You can turn this off anytime in More.',
      },
      controlNote:
        'You stay in control. Background location is optional and never required to use Nearsy.',
      enableBackground: 'Enable background location',
      notNow: 'Not now',
    },
    preparing: {
      title: 'Almost there!',
      body: 'We’re getting your location ready. One more quick step is coming up.',
    },
    servicesOffTitle: 'Location Services are off',
    servicesOffMessage:
      'Turn on Location Services in iOS Settings to use Visibility and nearby discovery.',
    accuracyTitle: 'More precise location needed',
    accuracyMessage:
      'Nearsy needs more precise location to show people within about 200 feet. Enable Precise Location for Nearsy in iOS Settings.',
  },
  language: {
    title: 'Language',
    description: 'Choose the language for the app interface',
    english: 'English',
    spanish: 'Spanish',
    current: 'Current: {{language}}',
    changeSuccess: 'Language updated',
  },
  appearance: {
    title: 'Appearance',
    description: 'Choose Light or Dark for the app interface',
    light: 'Light',
    dark: 'Dark',
    changeSuccess: 'Appearance updated',
  },
  logout: {
    title: 'Log out',
    error: 'Could not log out.',
  },
  deleteAccount: {
    title: 'Delete account',
    confirm: 'This action cannot be undone',
    body: 'Type DELETE to confirm. Your profile data and photos will be removed.',
    placeholder: 'Type DELETE',
    permanently: 'Delete permanently',
    alertTitle: 'Delete account',
    alertBody:
      'This will permanently delete your account and associated data. This action cannot be undone.',
    alertCancel: 'Cancel',
    alertConfirm: 'Delete',
    done: 'Your account has been deleted.',
    error: 'Could not delete account.',
    networkError: 'Network error. Check your connection and try again.',
    sessionNotRecent:
      'For security, confirm it’s you again to delete your account. Your account was not deleted.',
    appCheckFailed:
      'We couldn’t verify this app. Update Nearsy or try again later. Your account was not deleted.',
    signedOut: 'Your session has ended. Sign in again to delete your account.',
    inProgress: 'Your account deletion is already in progress. Please wait.',
    retryable: 'We couldn’t finish deleting your account. Please try again.',
    failed:
      'We couldn’t delete your account. Please try again later or contact Nearsy support.',
    networkUncertain:
      'We couldn’t confirm whether your account was deleted. Check your connection and try again.',
    pendingTitle: 'Deletion not confirmed',
    pendingChecking: 'Checking whether your account was deleted…',
    pendingExists:
      'Your account still exists, and we couldn’t confirm whether the deletion finished. You can request the deletion again below.',
    pendingUnverified:
      'We couldn’t check your account right now. Connect to the internet and try again, or sign out.',
    pendingRetry: 'Try again',
    pendingSignOut: 'Sign out',
    reconciledDeleted: 'Your account no longer exists. You’ve been signed out.',
    reconciledSignedOut:
      'You’ve been signed out. We couldn’t confirm whether your account was deleted. Sign in again to check.',
    linkedInSignInAgain:
      'For security, sign out, sign back in with LinkedIn, and request account deletion within the next 5 minutes.',
    linkedInRecentBody:
      'Your account signs in with LinkedIn. You can delete it if you signed in within the last 5 minutes.',
    methodsTitle: 'Confirm it’s you',
    methodsBody:
      'For security, choose one of your sign-in methods to confirm it’s you. Your account and data are deleted right after.',
    methodPassword: 'Password',
    methodGoogle: 'Google',
    methodApple: 'Apple',
    methodFacebook: 'Facebook',
    passwordPlaceholder: 'Password',
    reauthConfirm: 'Confirm password and delete',
    reauthContinueGoogle: 'Continue with Google and delete',
    reauthContinueApple: 'Continue with Apple and delete',
    reauthContinueFacebook: 'Continue with Facebook and delete',
    reauthError: 'Could not confirm password.',
    reauthFailed: 'Could not confirm your identity. Your account was not deleted.',
    reauthCancelled: 'Sign-in was cancelled. Your account was not deleted.',
    reauthMismatch:
      'That account does not match the one signed in to Nearsy. Your account was not deleted.',
    reauthUnavailable:
      'Account deletion for this sign-in method is temporarily unavailable in the app. Please contact Nearsy support for help.',
  },
  blockedPeople: {
    title: 'Blocked People',
    openHint: 'View and unblock people you have blocked',
    back: 'Back',
    loading: 'Loading blocked people…',
    empty: "You haven't blocked anyone.",
    unavailable: 'Unavailable user',
    loadError: 'Could not load blocked people.',
    retry: 'Retry',
    unblock: 'Unblock',
    cancel: 'Cancel',
    unblockConfirmTitle: 'Unblock {{name}}?',
    unblockConfirmTitleUnavailable: 'Unblock this user?',
    unblockConfirmBody:
      'They may appear in Nearby again if they meet your discovery settings.',
    unblockError: 'Could not unblock this person. Please try again.',
  },
  signInMethods: {
    title: 'Sign-in methods',
    openHint: 'View and connect the ways you sign in to Nearsy',
    back: 'Back',
    description: 'These are the methods linked to your Nearsy account.',
    linkedLabel: 'Connected',
    notLinkedLabel: 'Not connected',
    connectGoogle: 'Connect Google',
    connectApple: 'Connect Apple',
    connectFacebook: 'Connect Facebook',
    connecting: 'Connecting…',
    limitationNote: 'Some methods, such as LinkedIn, may not appear in this list.',
    providers: {
      password: 'Email and password',
      google: 'Google',
      apple: 'Apple',
      facebook: 'Facebook',
    },
    confirm: {
      title: 'Connect {{provider}}?',
      message:
        'You will sign in with {{provider}} to link it to this Nearsy account. Afterwards you can use {{provider}} to sign in to this same account.',
      cancel: 'Cancel',
      continue: 'Continue',
    },
    success: {
      google: {
        title: 'Google connected',
        message: 'You can now sign in to Nearsy with Google.',
      },
      apple: {
        title: 'Apple connected',
        message: 'You can now sign in to Nearsy with Apple.',
      },
      facebook: {
        title: 'Facebook connected',
        message: 'You can now sign in to Nearsy with Facebook.',
      },
    },
    alreadyLinked: {
      title: '{{provider}} already connected',
      message: '{{provider}} is already connected to this Nearsy account.',
    },
    errors: {
      title: "Couldn't connect {{provider}}",
      recentLoginTitle: 'Sign in again',
      notAuthenticated: 'Your session has ended. Sign in again and try once more.',
      unavailable: '{{provider}} is not available right now. Please try again later.',
      verificationFailed: "We couldn't verify your {{provider}} account. Please try again.",
      credentialInUse:
        'This {{provider}} account is already associated with another Nearsy account. Nothing was changed.',
      recentLogin:
        'For your security, sign out, sign back in to Nearsy with your current method and then try connecting {{provider}} again.',
      network: 'Check your connection and try again.',
      identityChanged:
        'Your session changed during the process. Sign in again and review your sign-in methods.',
      unknown: "We couldn't connect {{provider}}. Please try again.",
    },
  },
  editor: {
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
  },
  loadError: 'Could not load settings.',
  saveError: 'Could not save.',
  // Kept for resource compatibility; UI must not surface these in Unit 2A.
  contacts: {
    title: 'Contacts',
    enable: 'Use contacts for familiar alerts',
  },
} as const;
