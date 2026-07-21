export const validationTranslations = {
  en: {
    requiredField: 'This field is required.',
    invalidEmail: 'Please enter a valid email address.',
    weakPassword: 'Password must be at least 8 characters long.',
    strongPasswordRequired:
      'Password must be at least 8 characters and include letters and numbers.',
    emailMismatch: 'Email and confirmation email must match.',
    passwordMismatch: 'Password and confirmation must match.',
  },
  es: {
    requiredField: 'Este campo es obligatorio.',
    invalidEmail: 'Introduce una dirección de correo electrónico válida.',
    weakPassword: 'La contraseña debe tener al menos 8 caracteres.',
    strongPasswordRequired:
      'La contraseña debe tener al menos 8 caracteres e incluir letras y números.',
    emailMismatch: 'El correo y la confirmación deben coincidir.',
    passwordMismatch: 'La contraseña y la confirmación deben coincidir.',
  },
} as const;
