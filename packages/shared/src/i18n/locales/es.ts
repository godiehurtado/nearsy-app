import type { TranslationResources } from './en';

const es: TranslationResources = {
  common: {
    appName: 'Nearsy',
    loading: 'Cargando...',
    error: 'Algo salió mal',
    retry: 'Reintentar',
    cancel: 'Cancelar',
    save: 'Guardar',
    continue: 'Continuar',
    back: 'Atrás',
    buttons: {
      cancel: 'Cancelar',
      close: 'Cerrar',
      ok: 'OK',
    },
    or: 'o',
  },
  validation: {
    required: 'Este campo es obligatorio',
    invalidEmail: 'Ingresa un correo electrónico válido',
    invalidPhone: 'Ingresa un número de teléfono válido',
    passwordTooShort: 'La contraseña debe tener al menos 6 caracteres',
    passwordMin8: 'La contraseña debe tener al menos 8 caracteres.',
    passwordLettersAndNumbers:
      'La contraseña debe tener al menos 8 caracteres e incluir letras y números.',
    emailMismatch: 'El correo y la confirmación deben coincidir.',
    passwordMismatch: 'La contraseña y la confirmación deben coincidir.',
    birthYearRequired: 'Selecciona tu año de nacimiento.',
    minimumAge14: 'Debes tener 14 años o más para crear una cuenta.',
    termsRequired:
      'Debes aceptar los términos y condiciones para crear una cuenta.',
  },
  authentication: {
    login: {
      welcome: 'Bienvenido a',
      welcomeBack: 'Bienvenido de nuevo',
      slogan: 'Sé tu propia cartelera',
      tagline: 'Descubre personas interesantes a tu alrededor',
      email: 'Correo electrónico',
      password: 'Contraseña',
      submit: 'Iniciar sesión',
      forgotPassword: '¿Olvidaste tu contraseña?',
      noAccount: '¿No tienes una cuenta?',
      createProfile: 'Crea tu perfil',
      registrationGuideLink: 'Ver guía de registro',
      newHere: '¿NUEVO AQUÍ?',
      orContinueWith: 'o continúa con',
      separatorOr: 'o',
      termsPrefix: 'Al continuar aceptas los',
      termsLink: 'Términos',
      termsAnd: 'y la',
      privacyLink: 'Política de privacidad',
      social: {
        apple: 'Apple',
        google: 'Google',
        meta: 'Meta',
        linkedin: 'LinkedIn',
        appleAlertTitle: 'Iniciar sesión con Apple',
        appleComingSoon: 'Próximamente.',
      },
      alerts: {
        invalidEmailTitle: 'Correo inválido',
        missingPasswordTitle: 'Falta la contraseña',
        weakPasswordTitle: 'Contraseña débil',
        emailNotVerifiedTitle: 'Correo no verificado',
        emailNotVerifiedMessage:
          'Verifica tu correo con el enlace que te enviamos antes de iniciar sesión en este dispositivo. Si no lo ves, revisa tu carpeta de spam.',
        loginErrorTitle: 'Error al iniciar sesión',
      },
    },
    social: {
      comingSoonTitle: 'Próximamente',
      comingSoonMessage:
        'Esta opción de inicio de sesión estará disponible próximamente.',
    },
    forgotPassword: {
      resetTitle: 'Restablecer contraseña',
      enterEmailFirst:
        'Escribe tu correo arriba y toca "¿Olvidaste tu contraseña?" otra vez. Te enviaremos un enlace de restablecimiento.',
      invalidEmailTitle: 'Correo inválido',
      invalidEmailExample:
        'Ingresa un correo válido (por ejemplo: nombre@ejemplo.com).',
      checkEmailTitle: 'Revisa tu correo',
      emailSent:
        'Si este correo está registrado, recibirás un enlace para restablecer tu contraseña en los próximos minutos.',
      networkErrorTitle: 'Error de red',
      networkErrorMessage:
        'No pudimos contactar al servidor. Revisa tu conexión e inténtalo de nuevo.',
      genericReset:
        'Si este correo está registrado, recibirás un enlace para restablecer tu contraseña.',
    },
    register: {
      title: 'Crear cuenta',
      submit: 'Registrarse',
      loginLink: '¿Ya tienes una cuenta? Inicia sesión',
      fields: {
        email: 'Correo electrónico',
        confirmEmail: 'Confirmar correo',
        phone: 'Número de teléfono',
        password: 'Contraseña',
        confirmPassword: 'Confirmar contraseña',
        birthYear: 'Año de nacimiento *',
      },
      placeholders: {
        email: 'Correo electrónico',
        confirmEmail: 'Confirmar correo',
        phone: 'Número de teléfono',
        password: 'Contraseña',
        confirmPassword: 'Confirmar contraseña',
      },
      selectBirthYear: 'Seleccionar',
      birthYearModalTitle: 'Selecciona tu año de nacimiento',
      countryModalTitle: 'Selecciona el código de país',
      phoneHelper: 'Selecciona tu país e ingresa un número móvil válido.',
      ageHelper: 'Debes tener 14 años o más para registrarte.',
      termsPrefix: 'Acepto los',
      termsLink: 'términos y condiciones',
      successTitle: 'Cuenta creada',
      successIosMessage:
        'Tu cuenta se creó correctamente. Terminemos de configurar tu perfil.',
      successAndroidMessage:
        'Tu cuenta se creó correctamente. Inicia sesión para continuar configurando tu perfil.',
      guide: {
        skip: 'Omitir guía',
        next: 'Siguiente',
        finish: 'Finalizar',
        oneMoreThingTitle: 'Un momento',
        steps: {
          email: {
            title: 'Empieza con tu correo',
            description:
              'Ingresa el correo electrónico que quieres usar en Nearsy.',
          },
          confirmEmail: {
            title: 'Confirma tu correo',
            description:
              'Escríbelo otra vez para asegurarte de que no haya errores.',
          },
          phone: {
            title: 'Agrega tu número de teléfono',
            description:
              'Selecciona tu código de país e ingresa tu número móvil.',
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
              'Esto nos ayuda a confirmar que cumples la edad mínima.',
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
        validation: {
          email: 'Ingresa un correo válido para continuar.',
          confirmEmail:
            'Confirma tu correo. Debe coincidir con el correo de arriba.',
          phone:
            'Selecciona tu código de país e ingresa un número móvil válido.',
          password:
            'Crea una contraseña con al menos 8 caracteres, incluyendo letras y números.',
          confirmPassword:
            'Confirma tu contraseña. Debe coincidir con la contraseña de arriba.',
          birthYear:
            'Selecciona un año de nacimiento válido. Debes tener 14 años o más.',
          terms: 'Acepta los términos y condiciones para continuar.',
          finish:
            'Completa los datos de registro antes de finalizar la guía.',
        },
      },
      alerts: {
        birthYearRequiredTitle: 'Año de nacimiento requerido',
        birthYearRequiredMessage: 'Selecciona tu año de nacimiento.',
        minimumAgeTitle: 'Edad mínima',
        minimumAgeMessage: 'Debes tener 14 años o más para crear una cuenta.',
        invalidEmailTitle: 'Correo inválido',
        emailMismatchTitle: 'Los correos no coinciden',
        invalidPhoneTitle: 'Número inválido',
        weakPasswordTitle: 'Contraseña débil',
        passwordMismatchTitle: 'Las contraseñas no coinciden',
        termsRequiredTitle: 'Términos requeridos',
      },
    },
    otp: {
      title: 'Aún no disponible',
      subtitle:
        'La verificación por SMS solo está disponible en Android en esta versión beta.',
      comingSoonTitle: 'Próximamente',
      comingSoonMessage:
        'Habilitaremos la verificación por teléfono en iOS en una actualización futura.',
      goBack: 'Volver',
    },
    errors: {
      invalidEmail: 'Ingresa un correo electrónico válido.',
      invalidCredentials: 'Correo o contraseña incorrectos.',
      weakPasswordLogin:
        'La contraseña es muy débil. Usa al menos 8 caracteres.',
      weakPasswordRegister:
        'La contraseña es muy débil. Usa una contraseña más segura.',
      emailAlreadyInUse: 'Este correo ya está registrado. Intenta iniciar sesión.',
      networkError:
        'Error de red. Revisa tu conexión e inténtalo de nuevo.',
      tooManyRequests:
        'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
      operationNotAllowedLogin:
        'El inicio de sesión con correo y contraseña está deshabilitado.',
      operationNotAllowedRegister:
        'El registro con correo y contraseña está deshabilitado.',
      default: 'Algo salió mal. Inténtalo de nuevo.',
      missingPassword: 'Ingresa tu contraseña.',
      passwordMin8: 'La contraseña debe tener al menos 8 caracteres.',
      passwordStrong:
        'La contraseña debe tener al menos 8 caracteres e incluir letras y números.',
      emailConfirmMismatch: 'El correo y la confirmación deben coincidir.',
      passwordConfirmMismatch: 'La contraseña y la confirmación deben coincidir.',
      passwordConfirmMismatchLong:
        'La contraseña y la confirmación deben coincidir.',
      invalidPhoneOptional:
        'Si ingresas un teléfono, selecciona el código de país e ingresa un número móvil válido.',
      termsRequired:
        'Debes aceptar los términos y condiciones para crear una cuenta.',
    },
    logout: {
      title: 'Cerrar sesión',
      confirm: '¿Seguro que quieres cerrar sesión?',
    },
  },
  onboarding: {
    introVideo: {
      title: 'Bienvenido a Nearsy',
      subtitle:
        'Crea tu cuenta y empieza a conectar con personas a tu alrededor.',
      stepEmail: 'Agrega tu correo y contraseña',
      stepBirthYear: 'Confirma tu año de nacimiento',
      stepTerms: 'Acepta los términos y termina de configurar tu perfil',
      startRegistration: 'Comenzar registro',
      alreadyMember: '¿Ya eres parte de Nearsy?',
      signIn: 'Iniciar sesión',
      back: 'Atrás',
      skip: 'Omitir',
      continue: 'Continuar',
    },
    completeProfile: {
      title: 'Completa tu perfil',
      subtitle: 'Cuéntale a la gente un poco sobre ti',
    },
  },
  home: {
    greeting: 'Hola, {{name}}',
    visibility: {
      active: 'Activo',
      inactive: 'Inactivo',
      activeHint: 'Eres visible para usuarios cercanos',
      inactiveHint: 'Estás oculto para usuarios cercanos',
    },
    discovery: {
      title: 'Descubrimiento',
      cta: 'Ver quién está cerca',
    },
  },
  nearby: {
    title: 'Descubrimiento',
    hintWithLocation: 'Mostrando personas cerca de ti',
    hintWithoutLocation: 'Activa la ubicación para ver personas cerca de ti',
    pullToRefresh: 'Desliza para actualizar',
    emptyWithLocation: 'No se encontraron perfiles cercanos.',
    emptyWithoutLocation:
      'La ubicación está desactivada. Actívala y desliza para actualizar.',
  },
  profile: {
    title: 'Perfil',
    interests: {
      title: 'Intereses',
      personal: 'Intereses personales',
      professional: 'Intereses profesionales',
    },
    gallery: {
      title: 'Galería',
      addPhoto: 'Agregar foto',
    },
    affiliations: {
      title: 'Afiliaciones',
    },
    socialMedia: {
      title: 'Redes sociales',
    },
  },
  notifications: {
    title: 'Alertas',
    empty: 'No hay alertas por ahora',
    pullToRefresh: 'Desliza para actualizar',
    kinds: {
      contactNearby: 'Contacto cercano',
      interestNearby: 'Interés compartido cercano',
    },
  },
  settings: {
    title: 'Más',
    backgroundVisibility: {
      title: 'Permanecer visible en segundo plano',
      enabled: 'La visibilidad en segundo plano está activada',
      disabled: 'La visibilidad en segundo plano está desactivada',
    },
    contacts: {
      title: 'Contactos',
      enable: 'Usar contactos para alertas familiares',
    },
    language: {
      title: 'Idioma',
      description: 'Elige el idioma de la interfaz de la aplicación',
      english: 'Inglés',
      spanish: 'Español',
      current: 'Actual: {{language}}',
      changeSuccess: 'Idioma actualizado',
    },
    deleteAccount: {
      title: 'Eliminar cuenta',
      confirm: 'Esta acción no se puede deshacer',
    },
  },
};

export default es;
