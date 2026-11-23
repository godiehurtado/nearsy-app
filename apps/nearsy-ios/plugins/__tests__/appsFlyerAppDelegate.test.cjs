/**
 * AppsFlyer native wiring (contract nc1, C8): only https OneLink universal links on
 * nearsy.onelink.me/Uxo6 reach AppsFlyer. openURL (OAuth returns, Google/Facebook
 * schemes) and launch options never do. Fixture: expo-template-bare-minimum 54.0.54.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  applySwiftAppDelegate,
  analyzeSwiftAppDelegate,
  assertSwiftAppDelegate,
  applyPodfile,
  STRICT_FLAG,
} = require('../nearsyAppsFlyerCore');
const { normalizeSwiftAppDelegateFirebaseInit, analyzeAppDelegateFirebaseInit } = require('../nearsyRnfbAppCheckCore');

const EXPO54_TEMPLATE = `import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
}
`;

const ON = { enabled: true, host: 'nearsy.onelink.me', template: 'Uxo6' };

function bodyOf(contents, signature) {
  const start = contents.indexOf(signature);
  assert.ok(start >= 0, signature);
  const open = contents.indexOf('{', contents.indexOf(') -> Bool', start));
  let depth = 0;
  for (let i = open; i < contents.length; i += 1) {
    if (contents[i] === '{') depth += 1;
    if (contents[i] === '}') depth -= 1;
    if (depth === 0) return contents.slice(open, i + 1);
  }
  throw new Error('unbalanced');
}

describe('AppsFlyer AppDelegate (contract nc1, C8)', () => {
  it('off: leaves the template without any AppsFlyer code', () => {
    const out = applySwiftAppDelegate(EXPO54_TEMPLATE, { enabled: false });
    assert.equal(out, EXPO54_TEMPLATE);
    assert.equal(assertSwiftAppDelegate(out, false).appsFlyerReferences, 0);
  });

  it('on: forwards only a guarded continueUserActivity; never openURL or launch options', () => {
    const out = applySwiftAppDelegate(EXPO54_TEMPLATE, ON);
    const a = assertSwiftAppDelegate(out, true);
    assert.deepEqual(
      { forwards: a.continueUserActivityForwards, guarded: a.guardedForwards, open: a.handleOpenForwards, launch: a.launchOptionsForwards },
      { forwards: 1, guarded: 1, open: 0, launch: 0 },
    );
    const openBody = bodyOf(out, 'open url: URL');
    assert.equal(/AppsFlyer/.test(openBody), false, 'openURL (OAuth returns) never reaches AppsFlyer');
    const launchBody = bodyOf(out, 'didFinishLaunchingWithOptions launchOptions');
    assert.equal(/AppsFlyer/.test(launchBody), false, 'cold-start launch URLs never reach AppsFlyer');
    const continueBody = bodyOf(out, 'continue userActivity: NSUserActivity');
    // RN Linking still gets every activity (sign-in, other links).
    assert.match(continueBody, /RCTLinkingManager\.application\(application, continue: userActivity/);
    assert.match(continueBody, /return super\.application\(application, continue: userActivity/);
  });

  it('on: the filter accepts only https, no port/userinfo, the OneLink host and the template path', () => {
    const out = applySwiftAppDelegate(EXPO54_TEMPLATE, ON);
    assert.match(out, /userActivity\.activityType == NSUserActivityTypeBrowsingWeb/);
    assert.match(out, /parts\.scheme\?\.lowercased\(\) == "https"/);
    assert.match(out, /parts\.user == nil, parts\.password == nil, parts\.port == nil/);
    assert.match(out, /static let host = "nearsy\.onelink\.me"/);
    assert.match(out, /static let templatePath = "\/Uxo6"/);
    assert.match(out, /parts\.path == templatePath \|\| parts\.path\.hasPrefix\(templatePath \+ "\/"\)/);
    assert.match(out, /^import react_native_appsflyer\n/);
  });

  it('is idempotent and reversible', () => {
    const once = applySwiftAppDelegate(EXPO54_TEMPLATE, ON);
    const twice = applySwiftAppDelegate(once, ON);
    assert.equal(twice, once);
    const off = applySwiftAppDelegate(once, { enabled: false });
    assert.equal(analyzeSwiftAppDelegate(off).appsFlyerReferences, 0);
  });

  it('coexists with the App Check normalization in either order', () => {
    const a = applySwiftAppDelegate(normalizeSwiftAppDelegateFirebaseInit(EXPO54_TEMPLATE), ON);
    const b = normalizeSwiftAppDelegateFirebaseInit(applySwiftAppDelegate(EXPO54_TEMPLATE, ON));
    for (const out of [a, b]) {
      assert.equal(analyzeAppDelegateFirebaseInit(out).ok, true);
      assertSwiftAppDelegate(out, true);
    }
  });

  it('rejects a bad host/template and an unknown template shape', () => {
    assert.throws(() => applySwiftAppDelegate(EXPO54_TEMPLATE, { ...ON, host: 'evil"; x' }));
    assert.throws(() => applySwiftAppDelegate(EXPO54_TEMPLATE, { ...ON, template: '../x' }));
    assert.throws(() => applySwiftAppDelegate('class AppDelegate {}', ON), /continueUserActivity not found/);
  });

  it('a stock AppsFlyer forward left by another plugin fails the post-condition', () => {
    const stock = applySwiftAppDelegate(EXPO54_TEMPLATE, ON).replace(
      'return super.application(app, open: url, options: options)',
      'AppsFlyerAttribution.shared.handleOpen(url, options: options)\n    return super.application(app, open: url, options: options)',
    );
    assert.throws(() => assertSwiftAppDelegate(stock, true), /post-condition/);
  });
});

describe('AppsFlyer Podfile strict mode', () => {
  const PODFILE = "platform :ios, '15.1'\n\ntarget 'Nearsy' do\n  use_expo_modules!\n  config = use_native_modules!\nend\n";

  it('on: sets strict mode (no IDFA code) before use_expo_modules!, once', () => {
    const out = applyPodfile(PODFILE, true);
    assert.ok(out.indexOf(STRICT_FLAG) >= 0 && out.indexOf(STRICT_FLAG) < out.indexOf('use_expo_modules!'));
    assert.equal(applyPodfile(out, true), out);
  });

  it('off: no flag; and a foreign flag is refused', () => {
    assert.equal(applyPodfile(PODFILE, false), PODFILE);
    assert.equal(applyPodfile(applyPodfile(PODFILE, true), false), PODFILE);
    assert.throws(() => applyPodfile(PODFILE.replace('  use_expo', '$RNAppsFlyerStrictMode=false\n  use_expo'), true));
  });
});
