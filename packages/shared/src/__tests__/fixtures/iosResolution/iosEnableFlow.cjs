// Test fixture. Metro-like run: babel-preset-expo transform (CJS + interop, platform ios) and
// .ios.* first for extensionless relative imports. Synthetic data only.
const path = require('path');
const fs = require('fs');
const Module = require('module');

const repo = path.resolve(__dirname, '../../../../../..');
const shared = path.join(repo, 'packages/shared/src');

const seen = [];
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'expo-secure-store') return path.join(__dirname, 'secureStoreStub.cjs');
  if ((request.startsWith('.') && parent && parent.filename) || path.isAbsolute(request)) {
    const base = path.isAbsolute(request) ? request : path.resolve(path.dirname(parent.filename), request);
    const candidates = path.extname(request)
      ? [base]
      : ['.ios.ts', '.ios.tsx', '.ts', '.tsx', '.js'].map((e) => base + e);
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        if (/reevaluatePendingStore/.test(request)) {
          seen.push(`${path.basename(parent.filename)} imports ${request} -> ${path.basename(c)}`);
        }
        return c;
      }
    }
  }
  return original.call(this, request, parent, ...rest);
};

const babel = require(path.join(repo, 'node_modules/@babel/core'));
const preset = require.resolve(path.join(repo, 'node_modules/babel-preset-expo'));
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = function (module, filename) {
    const out = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      babelrc: false,
      configFile: false,
      presets: [[preset, {}]],
      caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: false, engine: 'hermes', supportsStaticESM: false },
    });
    module._compile(out.code, filename);
  };
}

// Exactly what iOS MoreScreen gets: reevaluateProximityNotices resolves to .ios.ts.
// The iOS variant does: ensureRegistered() (once) + the .ts createReevaluatePendingPort.
const notices = require(path.join(shared, 'alerts/reevaluateProximityNotices.ts'));
const pendingStoreIos = require(path.join(shared, 'alerts/reevaluatePendingStore'));
const diag = require(path.join(shared, 'contacts/contactsDiagnostics'));
const { enableAndSyncContacts } = require(path.join(shared, 'contacts/controller'));
const { createFakeContactsHmacClient } = require(path.join(shared, 'contacts/fakeClient'));
const { createSecureStoreContactsSessionStore } = require(path.join(shared, 'contacts/iosContactsSession'));

(async () => {
  const trace = diag.createContactsOperationTrace();
  const calls = [];
  const fake = createFakeContactsHmacClient({});
  const client = Object.fromEntries(
    Object.entries(fake).map(([n, fn]) => [n, (r) => { calls.push(n); trace.enter('auth_token'); return fn(r); }]),
  );
  const data = new Map();
  const store = {
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => { data.set(k, v); },
    deleteItemAsync: async (k) => { data.delete(k); },
  };
  // App start: ensureRegistered() sets registered=true, then registers the store.
  try { pendingStoreIos.ensureReevaluatePendingStoreRegistered(); console.log('store registration: ok'); }
  catch (e) { console.log('store registration threw', e.name, '(swallowed at app start; later calls skip it)'); }
  const pending = notices.createReevaluatePendingPort('SyntheticUid01');
  try { pending.isPending(); console.log('isPending: ok'); } catch (e) { console.log('isPending threw synchronously:', e.name); }
  const outcome = await enableAndSyncContacts({
    client,
    session: diag.traceContactsSession(createSecureStoreContactsSessionStore('SyntheticUid01', async () => store), trace),
    book: diag.traceContactsAddressBook(
      { getPermission: async () => 'granted', requestPermission: async () => 'granted', readRows: async () => [] },
      trace,
    ),
    reevaluatePending: pending,
    createRandomHex: () => 'abcdef0123456789',
  });
  console.log(seen.join('\n'));
  console.log('outcome:', JSON.stringify({ ok: outcome.ok, reason: outcome.reason }));
  console.log('identity calls:', calls.length);
  console.log('Ref:', trace.reference({ reason: outcome.reason ?? null }));
})();
