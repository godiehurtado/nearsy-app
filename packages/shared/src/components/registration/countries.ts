/** Dial-code list for the registration Phone step (v3 mockCountries + Americas). */
export type RegistrationCountry = {
  iso2: string;
  name: string;
  dial: string;
  flag: string;
};

export const REGISTRATION_COUNTRIES: RegistrationCountry[] = [
  { iso2: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { iso2: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { iso2: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽' },
  { iso2: 'CO', name: 'Colombia', dial: '+57', flag: '🇨🇴' },
  { iso2: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷' },
  { iso2: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱' },
  { iso2: 'PE', name: 'Peru', dial: '+51', flag: '🇵🇪' },
  { iso2: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { iso2: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { iso2: 'CR', name: 'Costa Rica', dial: '+506', flag: '🇨🇷' },
  { iso2: 'PA', name: 'Panama', dial: '+507', flag: '🇵🇦' },
  { iso2: 'GT', name: 'Guatemala', dial: '+502', flag: '🇬🇹' },
  { iso2: 'DO', name: 'Dominican Republic', dial: '+1', flag: '🇩🇴' },
  { iso2: 'EC', name: 'Ecuador', dial: '+593', flag: '🇪🇨' },
  { iso2: 'UY', name: 'Uruguay', dial: '+598', flag: '🇺🇾' },
  { iso2: 'VE', name: 'Venezuela', dial: '+58', flag: '🇻🇪' },
];
