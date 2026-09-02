const phoneOtp = {
  title: 'Verify your phone',
  subtitle: 'We will send a one-time code by SMS to confirm your number.',
  phoneStep: {
    title: 'Your mobile number',
    subtitle: 'Enter the number where you can receive SMS.',
    countryA11y: 'Select country code',
    phoneLabel: 'Phone number',
    phonePlaceholder: 'Mobile number',
    continue: 'Continue',
  },
  confirmStep: {
    title: 'Confirm your number',
    subtitle: 'We will send a verification code to:',
    sendCode: 'Send code',
    changeNumber: 'Change number',
  },
  codeStep: {
    title: 'Enter verification code',
    subtitle: 'We sent a code to {{maskedPhone}}.',
    codeLabel: 'Six-digit code',
    codePlaceholder: '000000',
    verify: 'Verify',
    resend: 'Resend code',
    resendIn: 'Resend in {{seconds}}s',
    attemptsRemaining: '{{count}} attempts remaining',
    changeNumber: 'Change number',
    cancel: 'Cancel verification',
  },
  success: {
    title: 'Phone verified',
    subtitle: 'Your number has been confirmed. Continuing to profile setup.',
    continue: 'Continue',
  },
  states: {
    sending: 'Sending code…',
    checking: 'Verifying…',
    loading: 'Loading…',
    featureDisabledTitle: 'Verification unavailable',
    featureDisabledMessage:
      'Phone verification is temporarily unavailable. Please try again later.',
    expiredTitle: 'Code expired',
    expiredMessage: 'Request a new code to continue.',
    lockedTitle: 'Too many attempts',
    lockedMessage: 'Request a new code to try again.',
    cancelledTitle: 'Verification cancelled',
    cancelledMessage: 'You can enter your number again to restart.',
    failedTitle: 'Something went wrong',
    failedMessage: 'Please try again.',
    retryBootstrap: 'Try again',
  },
  signOut: {
    label: 'Sign out',
    signingOut: 'Signing out…',
    failed: 'Unable to sign out right now. Please try again.',
  },
  errors: {
    invalidPhone: 'Enter a valid international mobile number.',
    invalidCode: 'Enter the six-digit code.',
    phoneNotAllowed: 'This phone number is not eligible for verification.',
    landlineBlocked: 'Landline numbers cannot receive SMS verification.',
    challengeNotFound: 'Verification session not found. Request a new code.',
    codeMismatch: 'The code is incorrect. Please try again.',
    challengeExpired: 'The code has expired. Request a new one.',
    challengeLocked: 'Too many attempts. Request a new code.',
    challengeCancelled: 'Verification was cancelled. Request a new code.',
    challengeFailed: 'Verification is no longer available. Request a new code.',
    claimConflict:
      'This phone number is already verified on another account.',
    verificationNotAuthorized:
      'Unable to verify this session. Please sign in and try again.',
    rateLimited: 'Too many verification sends. Try again later.',
    cooldown: 'Please wait before requesting another code.',
    operationInProgress: 'A verification is already in progress. Please wait.',
    featureDisabled:
      'Phone verification is temporarily unavailable. Please try again later.',
    authRequired: 'Sign in is required to verify your phone.',
    appCheckFailed:
      'Unable to verify this device right now. Please restart the app and try again.',
    providerUnavailable:
      'Unable to complete phone verification right now. Please try again.',
    configMissing:
      'Phone verification is not configured. Please try again later.',
    network: 'Network error. Check your connection and try again.',
    generic: 'Something went wrong. Please try again.',
    genericRetryable: 'Something went wrong. Please try again in a moment.',
  },
  a11y: {
    codeInput: 'Verification code',
    resendButton: 'Resend verification code',
    changeNumberButton: 'Change phone number',
    countrySelector: 'Country calling code',
    signOutButton: 'Sign out and return to login',
  },
} as const;

export default phoneOtp;
