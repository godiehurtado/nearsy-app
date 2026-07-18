export default {
  title: 'More',
  backgroundVisibility: {
    title: 'Stay visible in background',
    enabled: 'Background visibility is on',
    disabled: 'Background visibility is off',
  },
  contacts: {
    title: 'Contacts',
    enable: 'Use contacts for familiar alerts',
  },
  language: {
    title: 'Language',
    description: 'Choose the language for the app interface',
    english: 'English',
    spanish: 'Spanish',
    current: 'Current: {{language}}',
    changeSuccess: 'Language updated',
  },
  deleteAccount: {
    title: 'Delete account',
    confirm: 'This action cannot be undone',
  },
} as const;
