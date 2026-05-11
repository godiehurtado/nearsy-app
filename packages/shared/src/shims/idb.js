// packages/shared/src/shims/idb.js
module.exports = {
  openDB() {
    throw new Error('[idb shim] IndexedDB is not available in React Native.');
  },
  deleteDB() {
    throw new Error('[idb shim] IndexedDB is not available in React Native.');
  },
  wrap(v) {
    return v;
  },
  unwrap(v) {
    return v;
  },
  default: {
    openDB() {
      throw new Error('[idb shim] IndexedDB is not available in React Native.');
    },
    deleteDB() {
      throw new Error('[idb shim] IndexedDB is not available in React Native.');
    },
    wrap(v) {
      return v;
    },
    unwrap(v) {
      return v;
    },
  },
};
