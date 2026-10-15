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
  },
  time: {
    minutes: '{{count}}m',
    hours: '{{count}}h',
  },
  distance: '{{count}} ft',
  kinds: {
    interestNearby: 'Shared interest nearby',
  },
} as const;
