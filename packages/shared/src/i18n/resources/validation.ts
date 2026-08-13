export default {
  required: 'This field is required',
  invalidEmail: 'Enter a valid email address',
  invalidPhone: 'Enter a valid phone number',
  passwordTooShort: 'Password must be at least 6 characters',
  passwordMin8: 'Password must be at least 8 characters long.',
  passwordLettersAndNumbers:
    'Password must be at least 8 characters and include letters and numbers.',
  emailMismatch: 'Email and confirmation email must match.',
  passwordMismatch: 'Password and confirmation must match.',
  birthYearRequired: 'Please select your birth year.',
  minimumAge14: 'You must be 18+ to create an account.',
  minimumAge18: 'You must be 18+ to create an account.',
  termsRequired:
    'You must accept the terms and conditions to create an account.',
} as const;
