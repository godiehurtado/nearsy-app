export default {
  title: 'Notifications',
  loading: 'Loading notifications…',
  pullToRefresh: 'Pull to refresh',
  empty: {
    title: 'No nearby alerts',
    body: 'Pull to refresh to check again.',
  },
  inactive: {
    title: 'Visibility is off',
    body: 'Turn your account Active to discover nearby people.',
  },
  error: {
    title: 'Could not load alerts',
    body: 'Pull to refresh to try again.',
    permissionDenied:
      'Alerts could not be loaded right now. Pull to refresh to try again.',
  },
  messages: {
    interestNearby: '{{name}} is near you and you share interests{{interests}}.',
    interestsSuffix: ' ({{interests}})',
    nearbyOnly: '{{name}} is near you.',
    affiliationNearby: '{{name}} is near you and you share an affiliation.',
    affiliationNearbyNamed: '{{name}} is near you and you share {{affiliation}}.',
    affiliationNearbyNamedMore:
      '{{name}} is near you and you share {{affiliation}} and {{count}} more.',
  },
  time: {
    minutes: '{{count}}m',
    hours: '{{count}}h',
  },
  distance: '{{count}} ft',
  kinds: {
    interestNearby: 'Shared interest nearby',
    affiliationNearby: 'Shared affiliation nearby',
  },
  unseen: 'Unread alert',
  push: {
    interest: '{{name}} is nearby and shares interests with you.',
    contact: '{{name}}, one of your contacts, is nearby.',
    both: '{{name}}, one of your contacts, is nearby and shares interests with you.',
  },
} as const;
