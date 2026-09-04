export const phoneOtpTranslations = {
  en: {
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
} as const,
  es: {
    title: 'Verifica tu teléfono',
    subtitle: 'Enviaremos un código único por SMS para confirmar tu número.',
    phoneStep: {
      title: 'Tu número móvil',
      subtitle: 'Ingresa el número donde puedes recibir SMS.',
      countryA11y: 'Seleccionar código de país',
      phoneLabel: 'Número de teléfono',
      phonePlaceholder: 'Número móvil',
      continue: 'Continuar',
    },
    confirmStep: {
      title: 'Confirma tu número',
      subtitle: 'Enviaremos un código de verificación a:',
      sendCode: 'Enviar código',
      changeNumber: 'Cambiar número',
    },
    codeStep: {
      title: 'Ingresa el código',
      subtitle: 'Enviamos un código a {{maskedPhone}}.',
      codeLabel: 'Código de seis dígitos',
      codePlaceholder: '000000',
      verify: 'Verificar',
      resend: 'Reenviar código',
      resendIn: 'Reenviar en {{seconds}}s',
      attemptsRemaining: '{{count}} intentos restantes',
      changeNumber: 'Cambiar número',
      cancel: 'Cancelar verificación',
    },
    success: {
      title: 'Teléfono verificado',
      subtitle: 'Tu número fue confirmado. Continuando con el perfil.',
      continue: 'Continuar',
    },
    states: {
      sending: 'Enviando código…',
      checking: 'Verificando…',
      loading: 'Cargando…',
      featureDisabledTitle: 'Verificación no disponible',
      featureDisabledMessage:
        'La verificación por teléfono no está disponible temporalmente. Inténtalo más tarde.',
      expiredTitle: 'Código expirado',
      expiredMessage: 'Solicita un nuevo código para continuar.',
      lockedTitle: 'Demasiados intentos',
      lockedMessage: 'Solicita un nuevo código para intentar de nuevo.',
      cancelledTitle: 'Verificación cancelada',
      cancelledMessage: 'Puedes ingresar tu número de nuevo para reiniciar.',
      failedTitle: 'Algo salió mal',
      failedMessage: 'Por favor, inténtalo de nuevo.',
      retryBootstrap: 'Intentar de nuevo',
    },
    signOut: {
      label: 'Cerrar sesión',
      signingOut: 'Cerrando sesión…',
      failed: 'No se pudo cerrar sesión. Inténtalo de nuevo.',
    },
    errors: {
      invalidPhone: 'Ingresa un número móvil internacional válido.',
      invalidCode: 'Ingresa el código de seis dígitos.',
      phoneNotAllowed: 'Este número no es elegible para verificación.',
      landlineBlocked: 'Los números fijos no pueden recibir SMS.',
      challengeNotFound:
        'No se encontró la sesión de verificación. Solicita un nuevo código.',
      codeMismatch: 'El código es incorrecto. Inténtalo de nuevo.',
      challengeExpired: 'El código expiró. Solicita uno nuevo.',
      challengeLocked: 'Demasiados intentos. Solicita un nuevo código.',
      challengeCancelled: 'La verificación fue cancelada. Solicita un nuevo código.',
      challengeFailed:
        'La verificación ya no está disponible. Solicita un nuevo código.',
      claimConflict:
        'Este número ya está verificado en otra cuenta.',
      verificationNotAuthorized:
        'No se pudo verificar esta sesión. Inicia sesión e inténtalo de nuevo.',
      rateLimited: 'Demasiados envíos. Inténtalo más tarde.',
      cooldown: 'Espera antes de solicitar otro código.',
      operationInProgress:
        'Ya hay una verificación en curso. Por favor espera.',
      featureDisabled:
        'La verificación por teléfono no está disponible temporalmente.',
      authRequired: 'Debes iniciar sesión para verificar tu teléfono.',
      appCheckFailed:
        'No se pudo verificar este dispositivo. Reinicia la app e inténtalo de nuevo.',
      providerUnavailable:
        'No se pudo completar la verificación ahora. Inténtalo de nuevo.',
      configMissing:
        'La verificación por teléfono no está configurada. Inténtalo más tarde.',
      network: 'Error de red. Revisa tu conexión e inténtalo de nuevo.',
      generic: 'Algo salió mal. Inténtalo de nuevo.',
      genericRetryable: 'Algo salió mal. Inténtalo de nuevo en un momento.',
    },
    a11y: {
      codeInput: 'Código de verificación',
      resendButton: 'Reenviar código de verificación',
      changeNumberButton: 'Cambiar número de teléfono',
      countrySelector: 'Código telefónico del país',
      signOutButton: 'Cerrar sesión y volver al inicio de sesión',
    },
  } as const,
} as const;

export default phoneOtpTranslations;
