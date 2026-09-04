export type CountryPhoneOption = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
};

export const AMERICA_COUNTRIES: CountryPhoneOption[] = [
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { code: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { code: 'BZ', name: 'Belize', dialCode: '+501', flag: '🇧🇿' },
  { code: 'SV', name: 'El Salvador', dialCode: '+503', flag: '🇸🇻' },
  { code: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { code: 'NI', name: 'Nicaragua', dialCode: '+505', flag: '🇳🇮' },
  { code: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { code: 'PA', name: 'Panama', dialCode: '+507', flag: '🇵🇦' },
  { code: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺' },
  { code: 'DO', name: 'Dominican Republic', dialCode: '+1', flag: '🇩🇴' },
  { code: 'HT', name: 'Haiti', dialCode: '+509', flag: '🇭🇹' },
  { code: 'JM', name: 'Jamaica', dialCode: '+1', flag: '🇯🇲' },
  { code: 'TT', name: 'Trinidad and Tobago', dialCode: '+1', flag: '🇹🇹' },
  { code: 'BS', name: 'Bahamas', dialCode: '+1', flag: '🇧🇸' },
  { code: 'BB', name: 'Barbados', dialCode: '+1', flag: '🇧🇧' },
  { code: 'AG', name: 'Antigua and Barbuda', dialCode: '+1', flag: '🇦🇬' },
  { code: 'DM', name: 'Dominica', dialCode: '+1', flag: '🇩🇲' },
  { code: 'GD', name: 'Grenada', dialCode: '+1', flag: '🇬🇩' },
  { code: 'KN', name: 'Saint Kitts and Nevis', dialCode: '+1', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia', dialCode: '+1', flag: '🇱🇨' },
  {
    code: 'VC',
    name: 'Saint Vincent and the Grenadines',
    dialCode: '+1',
    flag: '🇻🇨',
  },
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { code: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { code: 'GY', name: 'Guyana', dialCode: '+592', flag: '🇬🇾' },
  { code: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },
  { code: 'PE', name: 'Peru', dialCode: '+51', flag: '🇵🇪' },
  { code: 'SR', name: 'Suriname', dialCode: '+597', flag: '🇸🇷' },
  { code: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
];

export function sanitizePhoneNumber(value: string) {
  return value.replace(/\D/g, '');
}

export function buildFullPhoneNumber(
  dialCode: string,
  localPhone: string,
): string {
  const cleanDialCode = dialCode.replace(/\D/g, '');
  const cleanLocalPhone = sanitizePhoneNumber(localPhone);
  return `+${cleanDialCode}${cleanLocalPhone}`;
}

export function splitStoredPhone(value?: string | null): {
  country: CountryPhoneOption;
  localPhone: string;
} {
  const fallback =
    AMERICA_COUNTRIES.find((c) => c.code === 'US') || AMERICA_COUNTRIES[0];

  if (!value) {
    return { country: fallback, localPhone: '' };
  }

  const normalized = value.replace(/\s+/g, '');

  if (normalized.startsWith('+1')) {
    const usCountry =
      AMERICA_COUNTRIES.find((c) => c.code === 'US') || fallback;
    return { country: usCountry, localPhone: normalized.slice(2) };
  }

  const sorted = [...AMERICA_COUNTRIES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  );
  const match = sorted.find((c) => normalized.startsWith(c.dialCode));
  if (!match) {
    return { country: fallback, localPhone: normalized.replace(/^\+/, '') };
  }
  return {
    country: match,
    localPhone: normalized.slice(match.dialCode.length),
  };
}

export function birthDigitsFromParts(
  parts: { day: number | null; month: number | null; year: number | null },
  order: 'MDY' | 'DMY' | 'YMD',
): string {
  if (parts.day == null || parts.month == null || parts.year == null) {
    return '';
  }
  const dd = String(parts.day).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  const yyyy = String(parts.year);
  if (order === 'MDY') return `${mm}${dd}${yyyy}`;
  if (order === 'DMY') return `${dd}${mm}${yyyy}`;
  return `${yyyy}${mm}${dd}`;
}
