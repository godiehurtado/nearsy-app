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
    errors: {
      cancelled: 'Sign-in was cancelled.',
      inProgress: 'Sign-in is already in progress.',
      providerUnavailable:
        'This sign-in option is unavailable on this device right now.',
      configuration:
        'Sign-in is not configured correctly. Please try again later.',
      network: 'Network error. Check your connection and try again.',
      invalidCredential:
        'Sign-in could not be verified. Please try again.',
      accountConflict:
        'An account already exists with this email using a different sign-in method.',
      generic: 'Something went wrong with sign-in. Please try again.',
    },
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
      realName: 'Real name *',
      email: 'Email',
      confirmEmail: 'Confirm Email',
      phone: 'Phone number (optional)',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      birthDate: 'Date of birth *',
      birthYear: 'Birth year *',
    },
    placeholders: {
      realName: 'Your full name',
      email: 'Email',
      confirmEmail: 'Confirm Email',
      phone: 'Phone number',
      password: 'Password',
      confirmPassword: 'Confirm Password',
    },
    selectBirthYear: 'Year',
    selectBirthMonth: 'Month',
    selectBirthDay: 'Day',
    birthYearModalTitle: 'Select your birth year',
    birthMonthModalTitle: 'Select month',
    birthDayModalTitle: 'Select day',
    birthDateModalTitle: 'Select your date of birth',
    countryModalTitle: 'Select country code',
    phoneHelper: 'Optional for now. Select your country and enter a valid mobile number.',
    ageHelper: 'You must be 18–99 to register.',
    termsPrefix: 'I agree to the',
    termsLink: 'terms and conditions',
    wizard: {
      continue: 'Continue',
      createAccount: 'Create account',
      backA11y: 'Back',
      selectCountryA11y: 'Select country dial code',
      steps: {
        birth: {
          title: 'When were you born?',
          subtitle: 'Your profile shows your age, not your birth date.',
          ageOk: "You're {{age}}",
          ageTooYoung: 'You must be 18+ to create an account.',
          ageTooOld: 'You must be {{age}} or younger to create an account.',
          futureDate: 'Enter a date of birth that is not in the future.',
          invalidDate: 'Enter a valid date of birth.',
        },
        email: {
          title: "What's your email?",
          subtitle: "We'll use it to keep your account secure.",
        },
        password: {
          title: 'Create a password',
          subtitle:
            'At least 8 characters, including letters and numbers.',
        },
        phone: {
          title: "What's your mobile number?",
          subtitle:
            'Required for your account. Phone verification will happen later — no code is sent yet.',
        },
        terms: {
          title: 'Terms and conditions',
          subtitle:
            'Review and accept the terms to create your account. Phone verification comes next.',
        },
      },
      fields: {
        day: 'Day',
        month: 'Month',
        year: 'Year',
        birthDate: 'Birth Date',
        email: 'Email',
        password: 'Password',
        phone: 'Mobile number',
      },
      placeholders: {
        day: 'DD',
        month: 'MM',
        year: 'YYYY',
        birthDateMdy: 'MM/DD/YYYY',
        birthDateDmy: 'DD/MM/YYYY',
        birthDateYmd: 'YYYY/MM/DD',
        email: 'Email',
        password: 'Password',
        phone: 'Mobile number',
      },
      a11y: {
        birthDateCalendar: 'Open birth date calendar',
      },
      calendarDone: 'Done',
      validation: {
        birthIncomplete: 'Enter your full date of birth',
        birthInvalid: 'Enter a valid date of birth.',
        birthFuture: 'Enter a date of birth that is not in the future.',
        birthMinimumAge: 'You must be 18+ to create an account.',
        birthMaximumAge: 'You must be {{age}} or younger to create an account.',
        email: 'Enter a valid email address',
        password:
          'Use at least 8 characters with letters and numbers',
        phone: 'Enter a valid mobile number',
        terms: 'Please accept the terms and conditions to continue.',
      },
    },
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
        realName: {
          title: 'Enter your real name',
          description: 'Use the name people will recognize you by on Nearsy.',
        },
        birthDate: {
          title: 'Select your date of birth',
          description:
            'Enter day, month and year so we can confirm the minimum age.',
        },
        email: {
          title: 'Start with your email',
          description: 'Enter the email address you want to use for Nearsy.',
        },
        confirmEmail: {
          title: 'Confirm your email',
          description:
            'Type your email again to make sure there are no mistakes.',
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
        phone: {
          title: 'Add your phone number',
          description:
            'Optional for this release. Select your country code and enter your mobile number.',
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
        realName: 'Please enter your real name to continue.',
        birthDate:
          'Please select a valid date of birth. You must be 18+ to register.',
        email: 'Please enter a valid email address to continue.',
        confirmEmail:
          'Please confirm your email. It needs to match the email above.',
        phone:
          'If you add a phone number, select your country code and enter a valid mobile number.',
        password:
          'Please create a password with at least 8 characters, including letters and numbers.',
        confirmPassword:
          'Please confirm your password. It needs to match the password above.',
        birthYear:
          'Please select a valid birth year. You must be 18+ to register.',
        terms: 'Please accept the terms and conditions to continue.',
        finish:
          'Please complete the registration details before finishing the guide.',
      },
    },
    alerts: {
      realNameRequiredTitle: 'Name required',
      realNameRequiredMessage: 'Please enter your real name.',
      birthDateRequiredTitle: 'Date of birth required',
      birthDateRequiredMessage: 'Please select your full date of birth.',
      birthYearRequiredTitle: 'Birth year required',
      birthYearRequiredMessage: 'Please select your birth year.',
      minimumAgeTitle: 'Minimum age',
      minimumAgeMessage: 'You must be 18+ to create an account.',
      maximumAgeMessage: 'You must be {{age}} or younger to create an account.',
      invalidEmailTitle: 'Invalid email',
      emailMismatchTitle: 'Email mismatch',
      invalidPhoneTitle: 'Invalid phone number',
      weakPasswordTitle: 'Weak password',
      passwordMismatchTitle: 'Password mismatch',
      termsRequiredTitle: 'Terms required',
    },
  },
  otp: {
    title: 'Verify your phone',
    subtitle: 'Confirm your mobile number with a one-time SMS code.',
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
