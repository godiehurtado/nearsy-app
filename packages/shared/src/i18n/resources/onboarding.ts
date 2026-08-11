export const onboardingTranslations = {
  en: {
    introVideo: {
      title: 'Welcome to Nearsy',
      subtitle:
        'Create your account and start connecting with people around you.',
      stepEmailPassword: 'Add your email and password',
      stepBirthYear: 'Confirm your birth year',
      stepTermsProfile: 'Accept terms and finish setting up your profile',
      startRegistration: 'Start registration',
      alreadyPartOf: 'Already part of Nearsy?',
      signIn: 'Sign in',
      skip: 'Skip',
      getStarted: 'Get started',
    },
    completeProfile: {
      title: 'Complete your profile',
    },
    /** Gate that decides ProfileCompletion vs MainTabs after auth. */
    profileGate: {
      errorTitle: 'Could not load your profile',
      errorMessage:
        'Check your connection and try again. You stay signed in.',
      retry: 'Try again',
      permissionDeniedMessage:
        'We could not access your profile right now. Try again in a moment.',
    },
    /** ProfileCompletion wizard (CRJ): type / info / interests / location / notifications / success. */
    profileCompletion: {
      continue: 'Continue',
      backA11y: 'Back',
      saveErrorTitle: 'Could not save',
      saveErrorMessage: 'Please try again. Your progress is still here.',
      type: {
        title: 'How will you use Nearsy?',
        subtitle: 'You can switch anytime later from your profile.',
        personalTitle: 'Personal',
        personalBody: 'Meet people nearby – hobbies and genuine connections.',
        professionalTitle: 'Professional',
        professionalBody: 'Showcase your company and grow your network.',
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
        subtitle: 'Your profile is ready. Start exploring people around you.',
        startExploring: 'Start Exploring',
        modeLabel: 'Starting as {{mode}}',
        modePersonal: 'Personal',
        modeProfessional: 'Professional',
      },
    },
  },
  es: {
    introVideo: {
      title: 'Bienvenido a Nearsy',
      subtitle:
        'Crea tu cuenta y empieza a conectar con personas a tu alrededor.',
      stepEmailPassword: 'Agrega tu correo y contraseña',
      stepBirthYear: 'Confirma tu año de nacimiento',
      stepTermsProfile:
        'Acepta los términos y termina de configurar tu perfil',
      startRegistration: 'Comenzar registro',
      alreadyPartOf: '¿Ya formas parte de Nearsy?',
      signIn: 'Iniciar sesión',
      skip: 'Omitir',
      getStarted: 'Comenzar',
    },
    completeProfile: {
      title: 'Completa tu perfil',
    },
    profileGate: {
      errorTitle: 'No se pudo cargar tu perfil',
      errorMessage:
        'Revisa tu conexión e inténtalo de nuevo. Sigues con la sesión iniciada.',
      retry: 'Reintentar',
      permissionDeniedMessage:
        'No pudimos acceder a tu perfil ahora. Inténtalo en un momento.',
    },
    profileCompletion: {
      continue: 'Continuar',
      backA11y: 'Atrás',
      saveErrorTitle: 'No se pudo guardar',
      saveErrorMessage: 'Inténtalo de nuevo. Tu progreso sigue aquí.',
      type: {
        title: '¿Cómo usarás Nearsy?',
        subtitle: 'Puedes cambiarlo cuando quieras desde tu perfil.',
        personalTitle: 'Personal',
        personalBody: 'Conoce personas cerca – hobbies y conexiones genuinas.',
        professionalTitle: 'Profesional',
        professionalBody: 'Muestra tu empresa y haz crecer tu red.',
        chooseRequired: 'Elige Personal o Profesional para continuar',
      },
      info: {
        title: 'Agrega una foto de perfil',
        subtitle:
          'Muestra tu mejor versión. Puedes tomarla ahora o subirla desde tu galería.',
        photoRequired: 'Se requiere una foto de perfil para continuar',
        takePhoto: 'Tomar foto',
        uploadPhoto: 'Subir',
      },
      interests: {
        title: '¿Qué te gusta?',
        subtitle:
          'Elige algunos — nos ayudan a encontrar a tu gente. ({{count}} seleccionados)',
        pickRequired: 'Elige al menos un interés para continuar',
        catalogErrorTitle: 'Intereses no disponibles',
        catalogErrorMessage:
          'No pudimos cargar los intereses. Revisa tu conexión e inténtalo de nuevo.',
        catalogRetry: 'Reintentar',
      },
      location: {
        title: 'Activa la ubicación',
        subtitle:
          'Nearsy te muestra personas que están realmente cerca. Sin ubicación no podemos hacerlo.',
        enable: 'Activar ubicación',
        skip: 'Omitir por ahora',
        deniedTitle: 'Ubicación no activada',
        deniedMessage:
          'Puedes activarla después en Ajustes. Aún puedes continuar.',
      },
      notifications: {
        title: 'Mantente al día',
        subtitle:
          'Recibe avisos cuando alguien interesante esté cerca o te escriba.',
        enable: 'Activar notificaciones',
        skip: 'Omitir por ahora',
        deniedTitle: 'Notificaciones no activadas',
        deniedMessage:
          'Puedes activarlas después en Ajustes. Aún puedes continuar.',
      },
      success: {
        title: 'Todo listo',
        subtitle: 'Tu perfil está listo. Empieza a explorar personas a tu alrededor.',
        startExploring: 'Empezar a explorar',
        modeLabel: 'Comenzando como {{mode}}',
        modePersonal: 'Personal',
        modeProfessional: 'Profesional',
      },
    },
  },
} as const;
