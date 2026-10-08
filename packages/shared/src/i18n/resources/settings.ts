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
    title: 'Phone number',
    placeholder: 'Phone number (optional)',
    hint: 'Optional. Used for contact purposes inside Nearsy and is not public.',
    invalid: 'Enter a valid mobile number with your country code.',
    selectCountry: 'Select country code',
    saved: 'Phone number updated',
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
    hint: 'Requires background location permission. On Android 11 and newer, choose Allow all the time in system Settings.',
    enabled: 'Background visibility is on',
    disabledTitle: 'Background updates are off',
    disabled:
      'Nearsy will no longer update your location in the background. The system permission may still be allowed until you change it in Settings.',
    disabledDone: 'Done',
    unsupported: 'Background location is not available on web.',
    authRequired: 'Please log in again.',
    error: 'Could not update background location.',
    openSettings: 'Open Settings',
    needsForegroundPermission:
      'Nearsy needs location access before background visibility can stay on. Enable location in system Settings, then return here.',
    needsBackgroundPermission:
      'Nearsy needs background location access to stay visible when the app is not open. Enable it in system Settings.',
    fgsNotificationTitle: 'Nearsy is updating your location',
    fgsNotificationBody:
      'Location may update in the background while Visibility is on',
    approximateTitle: 'Precise location needed',
    approximateMessage:
      'Nearsy needs precise location for about 200 ft nearby. Choose Precise for Nearsy in system Settings.',
    gpsOffTitle: 'Location services are off',
    gpsOffMessage:
      'Turn on Location Services / GPS in system Settings so Nearsy can find people nearby.',
    education: {
      full: {
        title: 'Stay discoverable nearby',
        body:
          'Nearsy can update your location in the background while Visibility is on, so people who are truly nearby can find you even when the app is closed. Background location is not used when Visibility is off.',
      },
      brief: {
        title: 'Enable background location?',
        body:
          'Background updates keep you discoverable nearby while Visibility is on. You can turn this off anytime in More.',
      },
      settingsHint:
        'To stay visible when Nearsy is closed, set location to Allow all the time in system Settings.',
      controlNote:
        'You stay in control. Background location is optional and never required to use Nearsy.',
      optionalNote:
        'Background location is optional. You can use Nearsy with foreground location only.',
      enableBackground: 'Enable background location',
      notNow: 'Not now',
    },
    // Legacy keys kept for any remaining call sites during transition.
    disclosure: {
      fullTitle: 'Stay discoverable nearby',
      fullBody:
        'Nearsy can update your location in the background while Visibility is on, so people who are truly nearby can find you even when the app is closed. Background location is not used when Visibility is off.',
      briefTitle: 'Enable background location?',
      briefBody:
        'Background updates keep you discoverable nearby while Visibility is on. You can turn this off anytime in More.',
      bulletVisibility:
        'Background location is not used when Visibility is off.',
      bulletNearby:
        'It helps keep encounters limited to people who are really close.',
      bulletControl:
        'You can turn this off anytime in More → Stay visible in background.',
      optionalNote:
        'Background location is optional. You can use Nearsy with foreground location only.',
      enable: 'Enable background location',
      notNow: 'Not now',
    },
    preparation: {
      title: 'Almost there!',
      body: 'We’re getting your location ready. One more quick step is coming up.',
    },
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
    permissionError:
      'Could not delete your account data. Please try again while signed in.',
    networkError: 'Network error. Check your connection and try again.',
    reauthBody: 'For security, please confirm your password to continue.',
    reauthBodyGoogle:
      'For security, continue with Google to confirm it’s you before deleting this account.',
    reauthBodyApple:
      'For security, continue with Apple to confirm it’s you before deleting this account.',
    reauthBodyFacebook:
      'For security, continue with Facebook to confirm it’s you before deleting this account.',
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
    methodsTitle: 'Confirm it’s you',
    methodsBody:
      'For security, confirm your identity with one of your sign-in methods. Your account and data are deleted right after.',
    methodPassword: 'Password',
    methodGoogle: 'Google',
    methodFacebook: 'Facebook',
    linkedInRecentBody:
      'Your account signs in with LinkedIn. You can delete it if you signed in within the last 5 minutes.',
    linkedInGuidance:
      'For security, sign out, sign back in with LinkedIn, and request account deletion within the next 5 minutes.',
    errorStaleSession:
      'For security, you need to have signed in recently. Confirm your identity again and retry. Your account was not deleted.',
    errorAppCheck:
      'We couldn’t verify this copy of Nearsy. Update the app or try again later. Your account was not deleted.',
    errorUnauthenticated:
      'Your session has ended. Sign in again and retry. Your account was not deleted.',
    errorRetryable:
      'We couldn’t finish deleting your account right now. Please try again in a few minutes.',
    errorPartial:
      'Some of your data couldn’t be deleted, so your account was kept. Please try again later or contact Nearsy support.',
    errorUserNotFound:
      'This account no longer exists or is unavailable. Sign in again to continue.',
    errorNetwork:
      'We couldn’t confirm the deletion because of a connection problem. Check your connection and try again.',
    errorUnknown:
      'We couldn’t confirm that your account was deleted. Please try again.',
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
    openHint: 'View how you sign in to Nearsy',
    back: 'Back',
    description: 'These are the methods linked to your Nearsy account.',
    methods: {
      email: 'Email and password',
      google: 'Google',
      facebook: 'Facebook',
      linkedin: 'LinkedIn',
    },
    connected: 'Connected',
    notConnected: 'Not connected',
    limitationNote: 'Some methods, such as LinkedIn, may not appear in this list.',
    connectGoogle: 'Connect Google',
    connectGoogleHint:
      'Add Google as another way to sign in to this same Nearsy account.',
    connectFacebook: 'Connect Facebook',
    connectFacebookHint:
      'Add Facebook as another way to sign in to this same Nearsy account.',
    confirmGoogleTitle: 'Connect Google?',
    confirmGoogleBody:
      'You will choose a Google account to add it as another way to access this same Nearsy account. Your profile and data stay the same.',
    confirmFacebookTitle: 'Connect Facebook?',
    confirmFacebookBody:
      'You will sign in to Facebook to add it as another way to access this same Nearsy account. Your profile and data stay the same.',
    confirmContinue: 'Continue',
    confirmCancel: 'Cancel',
    googleLinkedTitle: 'Google connected',
    googleLinkedBody: 'You can now sign in to Nearsy with Google.',
    facebookLinkedTitle: 'Facebook connected',
    facebookLinkedBody: 'You can now sign in to this Nearsy account with Facebook.',
    errors: {
      googleTitle: 'Could not connect Google',
      facebookTitle: 'Could not connect Facebook',
      googleInUse: 'This Google account is already associated with another Nearsy account.',
      credentialInUse:
        'This Facebook account is already connected to another Nearsy account. No changes were made.',
      emailInUse:
        'We couldn’t connect this Facebook account. No changes were made to your Nearsy account.',
      requiresRecentLogin:
        'For security, log out, sign back in with your current method and try again.',
      sessionChanged: 'Your session changed. Please sign in again and retry.',
      network: 'Network error. Check your connection and try again.',
      generic: 'Something went wrong while connecting this sign-in method. Please try again.',
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
