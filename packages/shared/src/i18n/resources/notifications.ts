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
  messages: {
    interestNearby: '{{name}} is near you and you share interests{{interests}}.',
    interestsSuffix: ' ({{interests}})',
    nearbyOnly: '{{name}} is near you.',
  },
  time: {
    minutes: '{{count}}m',
    hours: '{{count}}h',
  },
  distance: '{{count}} ft',
  kinds: {
    /** Nearby without shared interests — not an established contact relationship. */
    contactNearby: 'Nearby person',
    interestNearby: 'Shared interest nearby',
  },
} as const;
