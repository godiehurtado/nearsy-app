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
    affiliationNearby: '{{name}} is near you and you share affiliations.',
    affiliationNearbyOne: '{{name}} is near you and you share an affiliation.',
    affiliationMore: 'and {{count}} more',
    industryNearby: '{{name}} is nearby. You both work in {{industry}}.',
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
  unseen: 'Unread alert',
  push: {
    interest: '{{name}} is nearby and shares interests with you.',
    contact: '{{name}}, one of your contacts, is nearby.',
    both: '{{name}}, one of your contacts, is nearby and shares interests with you.',
  },
} as const;
