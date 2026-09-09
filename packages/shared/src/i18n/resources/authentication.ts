export const authenticationTranslations = {
  en: {
    login: {
      welcomeTo: 'Welcome to',
      slogan: 'Be your own billboard',
      emailPlaceholder: 'Email',
      passwordPlaceholder: 'Password',
      submit: 'Log In',
      or: 'or',
      continueWithApple: 'Continue with Apple',
      appleComingSoonTitle: 'Sign in with Apple',
      appleComingSoonMessage: 'Coming soon.',
      forgotPassword: 'Forgot Password',
      noAccount: 'Don’t Have an Account?',
      viewRegistrationGuide: 'View registration guide',
      welcomeBack: 'Welcome back',
      tagline: 'Discover interesting people around you',
      createProfile: 'Create your profile',
      newHere: 'NEW HERE',
      orContinueWith: 'or continue with',
      termsPrefix: "By continuing you agree to Nearsy's",
      termsLink: 'Terms',
      termsAnd: 'and',
      privacyLink: 'Privacy Policy',
      social: {
        google: 'Google',
        apple: 'Apple',
        meta: 'Meta',
        linkedin: 'LinkedIn',
      },
      alerts: {
        invalidEmailTitle: 'Invalid email',
        invalidEmailMessage: 'Please enter a valid email address.',
        missingPasswordTitle: 'Missing password',
        missingPasswordMessage: 'Please enter your password.',
        weakPasswordTitle: 'Weak password',
        weakPasswordMessage: 'Password must be at least 8 characters long.',
        emailNotVerifiedTitle: 'Email not verified',
        emailNotVerifiedMessage:
          'Please verify your email using the link we sent you before logging in on this device. If you don’t see the email, please check your Spam or Junk folder.',
        loginErrorTitle: 'Login Error',
      },
    },
    social: {
      comingSoonTitle: 'Coming soon',
      comingSoonMessage: 'This sign-in option will be available soon.',
      google: {
        errors: {
          configuration:
            'Google Sign-In is not configured correctly on this build. Please try again later.',
          providerUnavailable:
            'Google Sign-In is unavailable on this device. Please update Google Play Services and try again.',
          network:
            'Network error while signing in with Google. Please check your connection and try again.',
          invalidCredential:
            'We could not verify your Google account. Please try again.',
          userDisabled:
            'This account has been disabled. Please contact support.',
          generic: 'Something went wrong with Google Sign-In. Please try again.',
        },
      },
    },
    forgotPassword: {
      emptyEmailTitle: 'Reset your password',
      emptyEmailMessage:
        'Please type your email address above and tap "Forgot Password" again. We will send you a reset link to that email.',
      invalidEmailTitle: 'Invalid email',
      invalidEmailMessage:
        'Please enter a valid email address (for example: name@example.com).',
      successTitle: 'Check your email',
      successMessage:
        'If this email is registered, you will receive a link to reset your password in the next few minutes.',
      networkErrorTitle: 'Network error',
      networkErrorMessage:
        'We could not contact the server. Please check your connection and try again.',
      genericTitle: 'Reset your password',
      genericMessage:
        'If this email is registered, you will receive a link to reset your password.',
    },
    register: {
      title: 'Create Account',
      emailLabel: 'Email',
      emailPlaceholder: 'Email',
      confirmEmailLabel: 'Confirm Email',
      confirmEmailPlaceholder: 'Confirm Email',
      phoneLabel: 'Phone number',
      phonePlaceholder: 'Phone number',
      phoneHelper: 'Select your country and enter a valid mobile number.',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Password',
      confirmPasswordLabel: 'Confirm Password',
      confirmPasswordPlaceholder: 'Confirm Password',
      birthYearLabel: 'Birth year *',
      birthYearSelect: 'Select',
      birthYearModalTitle: 'Select your birth year',
      countryModalTitle: 'Select country code',
      ageHelper: 'You must be 18–99 to register.',
      birthDateModalTitle: 'Select your date of birth',
      termsPrefix: 'I agree to the',
      termsLink: 'terms and conditions',
      termsSuffix: '.',
      submit: 'Register',
      alreadyHaveAccount: 'Already have an account? Log In',
      loginLink: 'Already have an account? Log In',
      alerts: {
        birthYearRequiredTitle: 'Birth year required',
        birthYearRequiredMessage: 'Please select your birth year.',
        birthDateRequiredTitle: 'Date of birth required',
        birthDateRequiredMessage: 'Please enter your date of birth.',
        minimumAgeTitle: 'Minimum age',
        minimumAgeMessage: 'You must be 18+ to create an account.',
        maximumAgeMessage: 'You must be {{age}} or younger to create an account.',
        invalidEmailTitle: 'Invalid email',
        invalidEmailMessage: 'Please enter a valid email address.',
        emailMismatchTitle: 'Email mismatch',
        emailMismatchMessage: 'Email and confirmation email must match.',
        invalidPhoneTitle: 'Invalid phone number',
        invalidPhoneMessage:
          'If you provide a phone number, please select your country code and enter a valid mobile number.',
        weakPasswordTitle: 'Weak password',
        weakPasswordMessage:
          'Password must be at least 8 characters long and include letters and numbers.',
        passwordMismatchTitle: 'Password mismatch',
        passwordMismatchMessage:
          'Password and confirmation password must match.',
        termsRequiredTitle: 'Terms required',
        termsRequiredMessage:
          'You must accept the terms and conditions to create an account.',
        accountCreatedTitle: 'Account created',
        accountCreatedMessage:
          'Your account was created successfully. Please sign in to continue setting up your profile.',
        errorTitle: 'Error',
      },
      /** Auth registration: Email → Password → Birth → Terms (OTP after create). */
      wizard: {
        continue: 'Continue',
        createAccount: 'Create account',
        backA11y: 'Back',
        selectCountryA11y: 'Select country dial code',
        calendarDone: 'Done',
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
            subtitle: 'At least 8 characters, including letters and numbers.',
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
        },
        a11y: {
          birthDateCalendar: 'Open birth date calendar',
        },
        validation: {
          birthIncomplete: 'Enter your full date of birth',
          birthInvalid: 'Enter a valid date of birth.',
          birthFuture: 'Enter a date of birth that is not in the future.',
          birthMinimumAge: 'You must be 18+ to create an account.',
          birthMaximumAge: 'You must be {{age}} or younger to create an account.',
          email: 'Enter a valid email address',
          password: 'Use at least 8 characters with letters and numbers',
          terms: 'Please accept the terms and conditions to continue.',
        },
      },
      guide: {
        skip: 'Skip guide',
        gotIt: 'Got it',
        completeStepTitle: 'Complete this step',
        completeStepMessage:
          'Please finish the current field before continuing.',
        stepProgress: '{{current}}/{{total}}',
        steps: {
          email: {
            title: 'Start with your email',
            description:
              'Enter the email address you want to use for Nearsy.',
          },
          confirmEmail: {
            title: 'Confirm your email',
            description:
              'Type your email again to make sure there are no mistakes.',
          },
          phone: {
            title: 'Add your phone number',
            description:
              'Select your country code and enter your mobile number.',
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
      },
    },
    otp: {
      title: 'Verify your phone',
      subtitlePrefix: 'We sent a code by SMS to:',
      codeLabel: 'Verification code',
      codePlaceholder: '123456',
      verifyButton: 'Verify code',
      didNotReceive: "Didn't receive the code?",
      resendCode: 'Resend code',
      resendIn: 'Resend in {{seconds}}s',
      sendingSms: 'Sending SMS…',
      alerts: {
        phoneRequiredTitle: 'Phone required',
        phoneRequiredMessage: 'Phone number is missing.',
        notAvailableTitle: 'Not available yet',
        notAvailableMessage:
          'Phone verification via SMS is currently only available on Android in this beta version.',
        codeSentTitle: 'Code sent',
        codeSentMessage: 'We sent a verification code to {{phone}}.',
        errorTitle: 'Error',
        sendFailed: 'Could not send verification code.',
        noCodeSentTitle: 'No code sent',
        noCodeSentMessage:
          'We could not find an active verification. Please resend the code.',
        codeRequiredTitle: 'Code required',
        codeRequiredMessage: 'Please enter the verification code.',
        phoneVerifiedTitle: 'Phone verified',
        phoneVerifiedMessage: 'Your phone number has been verified.',
        verifyFailed: 'Could not verify this code.',
      },
      errors: {
        invalidCode: 'The code is invalid. Please check it and try again.',
        missingCode: 'Please enter the verification code.',
        codeExpired: 'The code has expired. Please request a new one.',
        tooManyRequests: 'Too many attempts. Please wait a bit and try again.',
        credentialAlreadyInUse:
          'This phone number is already associated with another account.',
        providerAlreadyLinked:
          'A phone number is already linked to this account. We will update it instead.',
        noAuthenticatedUser: 'No authenticated user.',
        sessionMismatch: 'Session mismatch. Please log in again.',
      },
    },
    errors: {
      invalidEmail: 'Please enter a valid email address.',
      invalidCredential: 'Invalid email or password.',
      weakPassword: 'Password is too weak. Please use at least 8 characters.',
      weakPasswordRegister:
        'Password is too weak. Please use a stronger password.',
      emailAlreadyInUse:
        'This email is already registered. Try logging in.',
      networkRequestFailed:
        'Network error. Please check your connection and try again.',
      /** @deprecated Alias of networkRequestFailed — kept for CRJ (ported from iOS) call sites. */
      networkError:
        'Network error. Please check your connection and try again.',
      tooManyRequests:
        'Too many attempts. Please wait a moment and try again.',
      operationNotAllowedSignIn:
        'Email/password sign-in is disabled for this project.',
      operationNotAllowedSignUp:
        'Email/password sign-up is disabled for this project.',
      generic: 'Something went wrong. Please try again.',
      /** @deprecated Alias of generic — kept for CRJ (ported from iOS) call sites. */
      default: 'Something went wrong. Please try again.',
      termsRequired:
        'You must accept the terms and conditions to create an account.',
    },
  },
  es: {
    login: {
      welcomeTo: 'Bienvenido a',
      slogan: 'Sé tu propio anuncio',
      emailPlaceholder: 'Correo electrónico',
      passwordPlaceholder: 'Contraseña',
      submit: 'Iniciar sesión',
      or: 'o',
      continueWithApple: 'Continuar con Apple',
      appleComingSoonTitle: 'Iniciar sesión con Apple',
      appleComingSoonMessage: 'Próximamente.',
      forgotPassword: 'Olvidé mi contraseña',
      noAccount: '¿No tienes una cuenta?',
      viewRegistrationGuide: 'Ver guía de registro',
      welcomeBack: 'Bienvenido de nuevo',
      tagline: 'Descubre personas interesantes a tu alrededor',
      createProfile: 'Crea tu perfil',
      newHere: '¿NUEVO AQUÍ?',
      orContinueWith: 'o continúa con',
      termsPrefix: 'Al continuar aceptas los',
      termsLink: 'Términos',
      termsAnd: 'y la',
      privacyLink: 'Política de privacidad',
      social: {
        google: 'Google',
        apple: 'Apple',
        meta: 'Meta',
        linkedin: 'LinkedIn',
      },
      alerts: {
        invalidEmailTitle: 'Correo no válido',
        invalidEmailMessage:
          'Introduce una dirección de correo electrónico válida.',
        missingPasswordTitle: 'Falta la contraseña',
        missingPasswordMessage: 'Introduce tu contraseña.',
        weakPasswordTitle: 'Contraseña débil',
        weakPasswordMessage:
          'La contraseña debe tener al menos 8 caracteres.',
        emailNotVerifiedTitle: 'Correo no verificado',
        emailNotVerifiedMessage:
          'Verifica tu correo con el enlace que te enviamos antes de iniciar sesión en este dispositivo. Si no lo ves, revisa la carpeta de spam o correo no deseado.',
        loginErrorTitle: 'Error al iniciar sesión',
      },
    },
    social: {
      comingSoonTitle: 'Próximamente',
      comingSoonMessage:
        'Esta opción de inicio de sesión estará disponible próximamente.',
      google: {
        errors: {
          configuration:
            'Google Sign-In no está configurado correctamente en esta versión. Inténtalo más tarde.',
          providerUnavailable:
            'Google Sign-In no está disponible en este dispositivo. Actualiza Google Play Services e inténtalo de nuevo.',
          network:
            'Error de red al iniciar sesión con Google. Revisa tu conexión e inténtalo de nuevo.',
          invalidCredential:
            'No pudimos verificar tu cuenta de Google. Inténtalo de nuevo.',
          userDisabled:
            'Esta cuenta ha sido deshabilitada. Contacta con soporte.',
          generic:
            'Algo salió mal con Google Sign-In. Inténtalo de nuevo.',
        },
      },
    },
    forgotPassword: {
      emptyEmailTitle: 'Restablecer contraseña',
      emptyEmailMessage:
        'Escribe tu correo electrónico arriba y vuelve a tocar "Olvidé mi contraseña". Te enviaremos un enlace de restablecimiento a ese correo.',
      invalidEmailTitle: 'Correo no válido',
      invalidEmailMessage:
        'Introduce una dirección de correo válida (por ejemplo: nombre@ejemplo.com).',
      successTitle: 'Revisa tu correo',
      successMessage:
        'Si este correo está registrado, recibirás un enlace para restablecer tu contraseña en unos minutos.',
      networkErrorTitle: 'Error de red',
      networkErrorMessage:
        'No pudimos contactar al servidor. Revisa tu conexión e inténtalo de nuevo.',
      genericTitle: 'Restablecer contraseña',
      genericMessage:
        'Si este correo está registrado, recibirás un enlace para restablecer tu contraseña.',
    },
    register: {
      title: 'Crear cuenta',
      emailLabel: 'Correo electrónico',
      emailPlaceholder: 'Correo electrónico',
      confirmEmailLabel: 'Confirmar correo',
      confirmEmailPlaceholder: 'Confirmar correo',
      phoneLabel: 'Número de teléfono',
      phonePlaceholder: 'Número de teléfono',
      phoneHelper:
        'Selecciona tu país e introduce un número de móvil válido.',
      passwordLabel: 'Contraseña',
      passwordPlaceholder: 'Contraseña',
      confirmPasswordLabel: 'Confirmar contraseña',
      confirmPasswordPlaceholder: 'Confirmar contraseña',
      birthYearLabel: 'Año de nacimiento *',
      birthYearSelect: 'Seleccionar',
      birthYearModalTitle: 'Selecciona tu año de nacimiento',
      countryModalTitle: 'Seleccionar código de país',
      ageHelper: 'Debes tener entre 18 y 99 años para registrarte.',
      birthDateModalTitle: 'Selecciona tu fecha de nacimiento',
      termsPrefix: 'Acepto los',
      termsLink: 'términos y condiciones',
      termsSuffix: '.',
      submit: 'Registrarse',
      alreadyHaveAccount: '¿Ya tienes una cuenta? Iniciar sesión',
      loginLink: '¿Ya tienes una cuenta? Iniciar sesión',
      alerts: {
        birthYearRequiredTitle: 'Año de nacimiento obligatorio',
        birthYearRequiredMessage: 'Selecciona tu año de nacimiento.',
        birthDateRequiredTitle: 'Fecha de nacimiento requerida',
        birthDateRequiredMessage: 'Ingresa tu fecha de nacimiento.',
        minimumAgeTitle: 'Edad mínima',
        minimumAgeMessage: 'Debes tener 18 años o más para crear una cuenta.',
        maximumAgeMessage:
          'Debes tener {{age}} años o menos para crear una cuenta.',
        invalidEmailTitle: 'Correo no válido',
        invalidEmailMessage:
          'Introduce una dirección de correo electrónico válida.',
        emailMismatchTitle: 'Correos no coinciden',
        emailMismatchMessage:
          'El correo y la confirmación deben coincidir.',
        invalidPhoneTitle: 'Número de teléfono no válido',
        invalidPhoneMessage:
          'Si proporcionas un teléfono, selecciona el código de país e introduce un número de móvil válido.',
        weakPasswordTitle: 'Contraseña débil',
        weakPasswordMessage:
          'La contraseña debe tener al menos 8 caracteres e incluir letras y números.',
        passwordMismatchTitle: 'Contraseñas no coinciden',
        passwordMismatchMessage:
          'La contraseña y la confirmación deben coincidir.',
        termsRequiredTitle: 'Términos requeridos',
        termsRequiredMessage:
          'Debes aceptar los términos y condiciones para crear una cuenta.',
        accountCreatedTitle: 'Cuenta creada',
        accountCreatedMessage:
          'Tu cuenta se creó correctamente. Inicia sesión para continuar con la configuración de tu perfil.',
        errorTitle: 'Error',
      },
      /** Registro auth: Correo → Contraseña → Nacimiento → Términos (OTP tras crear). */
      wizard: {
        continue: 'Continuar',
        createAccount: 'Crear cuenta',
        backA11y: 'Atrás',
        selectCountryA11y: 'Seleccionar código de país',
        calendarDone: 'Listo',
        steps: {
          birth: {
            title: '¿Cuándo naciste?',
            subtitle: 'Tu perfil muestra tu edad, no tu fecha de nacimiento.',
            ageOk: 'Tienes {{age}} años',
            ageTooYoung: 'Debes tener 18 años o más para crear una cuenta.',
            ageTooOld:
              'Debes tener {{age}} años o menos para crear una cuenta.',
            futureDate:
              'Ingresa una fecha de nacimiento que no esté en el futuro.',
            invalidDate: 'Ingresa una fecha de nacimiento válida.',
          },
          email: {
            title: '¿Cuál es tu correo?',
            subtitle: 'Lo usaremos para mantener tu cuenta segura.',
          },
          password: {
            title: 'Crea una contraseña',
            subtitle: 'Al menos 8 caracteres, incluyendo letras y números.',
          },
          terms: {
            title: 'Términos y condiciones',
            subtitle:
              'Revisa y acepta los términos para crear tu cuenta. A continuación viene la verificación del teléfono.',
          },
        },
        fields: {
          day: 'Día',
          month: 'Mes',
          year: 'Año',
          birthDate: 'Fecha de nacimiento',
          email: 'Correo electrónico',
          password: 'Contraseña',
        },
        placeholders: {
          day: 'DD',
          month: 'MM',
          year: 'AAAA',
          birthDateMdy: 'MM/DD/AAAA',
          birthDateDmy: 'DD/MM/AAAA',
          birthDateYmd: 'AAAA/MM/DD',
          email: 'Correo electrónico',
          password: 'Contraseña',
        },
        a11y: {
          birthDateCalendar: 'Abrir calendario de fecha de nacimiento',
        },
        validation: {
          birthIncomplete: 'Ingresa tu fecha de nacimiento completa',
          birthInvalid: 'Ingresa una fecha de nacimiento válida.',
          birthFuture:
            'Ingresa una fecha de nacimiento que no esté en el futuro.',
          birthMinimumAge: 'Debes tener 18 años o más para crear una cuenta.',
          birthMaximumAge:
            'Debes tener {{age}} años o menos para crear una cuenta.',
          email: 'Ingresa un correo electrónico válido',
          password: 'Usa al menos 8 caracteres con letras y números',
          terms: 'Acepta los términos y condiciones para continuar.',
        },
      },
      guide: {
        skip: 'Omitir guía',
        gotIt: 'Entendido',
        completeStepTitle: 'Completa este paso',
        completeStepMessage:
          'Termina el campo actual antes de continuar.',
        stepProgress: '{{current}}/{{total}}',
        steps: {
          email: {
            title: 'Empieza con tu correo',
            description:
              'Introduce el correo electrónico que quieres usar en Nearsy.',
          },
          confirmEmail: {
            title: 'Confirma tu correo',
            description:
              'Escribe tu correo otra vez para asegurarte de que no haya errores.',
          },
          phone: {
            title: 'Agrega tu número de teléfono',
            description:
              'Selecciona el código de país e introduce tu número de móvil.',
          },
          password: {
            title: 'Crea una contraseña segura',
            description:
              'Usa al menos 8 caracteres, incluyendo letras y números.',
          },
          confirmPassword: {
            title: 'Confirma tu contraseña',
            description: 'Escribe la misma contraseña otra vez.',
          },
          birthYear: {
            title: 'Selecciona tu año de nacimiento',
            description:
              'Esto nos ayuda a confirmar que cumples con la edad mínima.',
          },
          terms: {
            title: 'Acepta los términos',
            description:
              'Revisa y acepta los términos para crear tu cuenta.',
          },
          finish: {
            title: 'Finaliza el registro',
            description:
              'Toca Registrarse para continuar con la configuración de tu perfil.',
          },
        },
      },
    },
    otp: {
      title: 'Verifica tu teléfono',
      subtitlePrefix: 'Enviamos un código por SMS a:',
      codeLabel: 'Código de verificación',
      codePlaceholder: '123456',
      verifyButton: 'Verificar código',
      didNotReceive: '¿No recibiste el código?',
      resendCode: 'Reenviar código',
      resendIn: 'Reenviar en {{seconds}}s',
      sendingSms: 'Enviando SMS…',
      alerts: {
        phoneRequiredTitle: 'Teléfono requerido',
        phoneRequiredMessage: 'Falta el número de teléfono.',
        notAvailableTitle: 'Aún no disponible',
        notAvailableMessage:
          'La verificación telefónica por SMS solo está disponible en Android en esta versión beta.',
        codeSentTitle: 'Código enviado',
        codeSentMessage: 'Enviamos un código de verificación a {{phone}}.',
        errorTitle: 'Error',
        sendFailed: 'No se pudo enviar el código de verificación.',
        noCodeSentTitle: 'No se envió el código',
        noCodeSentMessage:
          'No encontramos una verificación activa. Vuelve a enviar el código.',
        codeRequiredTitle: 'Código requerido',
        codeRequiredMessage: 'Introduce el código de verificación.',
        phoneVerifiedTitle: 'Teléfono verificado',
        phoneVerifiedMessage: 'Tu número de teléfono ha sido verificado.',
        verifyFailed: 'No se pudo verificar este código.',
      },
      errors: {
        invalidCode:
          'El código no es válido. Revísalo e inténtalo de nuevo.',
        missingCode: 'Introduce el código de verificación.',
        codeExpired: 'El código ha expirado. Solicita uno nuevo.',
        tooManyRequests:
          'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
        credentialAlreadyInUse:
          'Este número de teléfono ya está asociado a otra cuenta.',
        providerAlreadyLinked:
          'Ya hay un número de teléfono vinculado a esta cuenta. Lo actualizaremos en su lugar.',
        noAuthenticatedUser: 'No hay un usuario autenticado.',
        sessionMismatch:
          'La sesión no coincide. Vuelve a iniciar sesión.',
      },
    },
    errors: {
      invalidEmail: 'Introduce una dirección de correo electrónico válida.',
      invalidCredential: 'Correo o contraseña incorrectos.',
      weakPassword:
        'La contraseña es demasiado débil. Usa al menos 8 caracteres.',
      weakPasswordRegister:
        'La contraseña es demasiado débil. Usa una contraseña más segura.',
      emailAlreadyInUse:
        'Este correo ya está registrado. Intenta iniciar sesión.',
      networkRequestFailed:
        'Error de red. Revisa tu conexión e inténtalo de nuevo.',
      tooManyRequests:
        'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
      operationNotAllowedSignIn:
        'El inicio de sesión con correo y contraseña está deshabilitado en este proyecto.',
      operationNotAllowedSignUp:
        'El registro con correo y contraseña está deshabilitado en este proyecto.',
      generic: 'Algo salió mal. Inténtalo de nuevo.',
      /** @deprecated Alias de networkRequestFailed — para sitios de llamada CRJ (portados de iOS). */
      networkError: 'Error de red. Revisa tu conexión e inténtalo de nuevo.',
      /** @deprecated Alias de generic — para sitios de llamada CRJ (portados de iOS). */
      default: 'Algo salió mal. Inténtalo de nuevo.',
      termsRequired:
        'Debes aceptar los términos y condiciones para crear una cuenta.',
    },
  },
} as const;
