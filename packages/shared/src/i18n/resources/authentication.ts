export default {
  login: {
    welcome: 'Welcome to',
    welcomeBack: 'Welcome back',
    slogan: 'Be your own billboard',
    tagline: 'Discover interesting people around you',
    email: 'Email',
    password: 'Password',
    submit: 'Log In',
    forgotPassword: 'Forgot Password',
    noAccount: "Don't Have an Account?",
    createProfile: 'Create your profile',
    registrationGuideLink: 'View registration guide',
    newHere: 'NEW HERE',
    orContinueWith: 'or continue with',
    separatorOr: 'or',
    termsPrefix: "By continuing you agree to Nearsy's",
    termsLink: 'Terms',
    termsAnd: 'and',
    privacyLink: 'Privacy Policy',
    social: {
      apple: 'Apple',
      google: 'Google',
      meta: 'Meta',
      linkedin: 'LinkedIn',
      appleAlertTitle: 'Sign in with Apple',
      appleComingSoon: 'Coming soon.',
    },
    alerts: {
      invalidEmailTitle: 'Invalid email',
      missingPasswordTitle: 'Missing password',
      weakPasswordTitle: 'Weak password',
      emailNotVerifiedTitle: 'Email not verified',
      emailNotVerifiedMessage:
        'Please verify your email using the link we sent you before logging in on this device. If you don’t see the email, please check your Spam or Junk folder.',
      loginErrorTitle: 'Login Error',
    },
  },
  social: {
    comingSoonTitle: 'Coming soon',
    comingSoonMessage: 'This sign-in option will be available soon.',
  },
  forgotPassword: {
    resetTitle: 'Reset your password',
    enterEmailFirst:
      'Please type your email address above and tap "Forgot Password" again. We will send you a reset link to that email.',
    invalidEmailTitle: 'Invalid email',
    invalidEmailExample:
      'Please enter a valid email address (for example: name@example.com).',
    checkEmailTitle: 'Check your email',
    emailSent:
      'If this email is registered, you will receive a link to reset your password in the next few minutes.',
    networkErrorTitle: 'Network error',
    networkErrorMessage:
      'We could not contact the server. Please check your connection and try again.',
    genericReset:
      'If this email is registered, you will receive a link to reset your password.',
  },
  register: {
    title: 'Create Account',
    submit: 'Register',
    loginLink: 'Already have an account? Log In',
    fields: {
      email: 'Email',
      confirmEmail: 'Confirm Email',
      phone: 'Phone number',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      birthYear: 'Birth year *',
    },
    placeholders: {
      email: 'Email',
      confirmEmail: 'Confirm Email',
      phone: 'Phone number',
      password: 'Password',
      confirmPassword: 'Confirm Password',
    },
    selectBirthYear: 'Select',
    birthYearModalTitle: 'Select your birth year',
    countryModalTitle: 'Select country code',
    phoneHelper: 'Select your country and enter a valid mobile number.',
    ageHelper: 'You must be 14+ to register.',
    termsPrefix: 'I agree to the',
    termsLink: 'terms and conditions',
    successTitle: 'Account created',
    successIosMessage:
      "Your account was created successfully. Let's finish setting up your profile.",
    successAndroidMessage:
      'Your account was created successfully. Please sign in to continue setting up your profile.',
    guide: {
      skip: 'Skip guide',
      next: 'Next',
      finish: 'Finish',
      oneMoreThingTitle: 'One more thing',
      steps: {
        email: {
          title: 'Start with your email',
          description: 'Enter the email address you want to use for Nearsy.',
        },
        confirmEmail: {
          title: 'Confirm your email',
          description:
            'Type your email again to make sure there are no mistakes.',
        },
        phone: {
          title: 'Add your phone number',
          description: 'Select your country code and enter your mobile number.',
        },
        password: {
          title: 'Create a secure password',
          description:
            'Use at least 8 characters, including letters and numbers.',
        },
        confirmPassword: {
          title: 'Confirm your password',
          description: 'Type the same password again.',
        },
        birthYear: {
          title: 'Select your birth year',
          description:
            'This helps us confirm you meet the minimum age requirement.',
        },
        terms: {
          title: 'Accept the terms',
          description: 'Review and accept the terms to create your account.',
        },
        finish: {
          title: 'Finish registration',
          description: 'Tap Register to continue with your profile setup.',
        },
      },
      validation: {
        email: 'Please enter a valid email address to continue.',
        confirmEmail:
          'Please confirm your email. It needs to match the email above.',
        phone:
          'Please select your country code and enter a valid mobile number.',
        password:
          'Please create a password with at least 8 characters, including letters and numbers.',
        confirmPassword:
          'Please confirm your password. It needs to match the password above.',
        birthYear:
          'Please select a valid birth year. You must be 14+ to register.',
        terms: 'Please accept the terms and conditions to continue.',
        finish:
          'Please complete the registration details before finishing the guide.',
      },
    },
    alerts: {
      birthYearRequiredTitle: 'Birth year required',
      birthYearRequiredMessage: 'Please select your birth year.',
      minimumAgeTitle: 'Minimum age',
      minimumAgeMessage: 'You must be 14+ to create an account.',
      invalidEmailTitle: 'Invalid email',
      emailMismatchTitle: 'Email mismatch',
      invalidPhoneTitle: 'Invalid phone number',
      weakPasswordTitle: 'Weak password',
      passwordMismatchTitle: 'Password mismatch',
      termsRequiredTitle: 'Terms required',
    },
  },
  otp: {
    title: 'Not available yet',
    subtitle:
      'Phone verification via SMS is currently only available on Android in this beta version.',
    comingSoonTitle: 'Coming soon',
    comingSoonMessage:
      'We will enable iOS phone verification in a future update.',
    goBack: 'Go back',
  },
  errors: {
    invalidEmail: 'Please enter a valid email address.',
    invalidCredentials: 'Invalid email or password.',
    weakPasswordLogin:
      'Password is too weak. Please use at least 8 characters.',
    weakPasswordRegister:
      'Password is too weak. Please use a stronger password.',
    emailAlreadyInUse: 'This email is already registered. Try logging in.',
    networkError:
      'Network error. Please check your connection and try again.',
    tooManyRequests:
      'Too many attempts. Please wait a moment and try again.',
    operationNotAllowedLogin:
      'Email/password sign-in is disabled for this project.',
    operationNotAllowedRegister:
      'Email/password sign-up is disabled for this project.',
    default: 'Something went wrong. Please try again.',
    missingPassword: 'Please enter your password.',
    passwordMin8: 'Password must be at least 8 characters long.',
    passwordStrong:
      'Password must be at least 8 characters and include letters and numbers.',
    emailConfirmMismatch: 'Email and confirmation email must match.',
    passwordConfirmMismatch: 'Password and confirmation must match.',
    passwordConfirmMismatchLong:
      'Password and confirmation password must match.',
    invalidPhoneOptional:
      'If you provide a phone number, please select your country code and enter a valid mobile number.',
    termsRequired:
      'You must accept the terms and conditions to create an account.',
  },
  logout: {
    title: 'Sign out',
    confirm: 'Are you sure you want to sign out?',
  },
} as const;
