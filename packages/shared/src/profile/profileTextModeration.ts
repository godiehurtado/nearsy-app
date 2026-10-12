const BLOCKED_WORDS = [
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'nigger',
  'nigga',
  'faggot',
  'slut',
  'whore',
  'puta',
  'mierda',
  'idiota',
  'imbecil',
  'malparido',
  'gonorrea',
];

function normalizeModerationText(value: string) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function containsObjectionableContent(value: string) {
  const normalized = normalizeModerationText(value);
  return BLOCKED_WORDS.some((word) => normalized.includes(word));
}
