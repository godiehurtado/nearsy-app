/**
 * Simulate Expo 54 + RNFB 23.8.6 AppDelegate plugin chain (I1-G).
 * Runs on Windows without native ios/ generation.
 */
const assert = require('node:assert/strict');
const path = require('path');
const rnfbAppRoot = path.dirname(
  require.resolve('@react-native-firebase/app/package.json'),
);
const rnfbCheckRoot = path.dirname(
  require.resolve('@react-native-firebase/app-check/package.json'),
);

const {
  modifySwiftAppDelegate: modifyApp,
} = require(path.join(rnfbAppRoot, 'plugin/build/ios/appDelegate.js'));
const {
  modifySwiftAppDelegate: modifyAppCheck,
} = require(path.join(rnfbCheckRoot, 'plugin/build/ios/appDelegate.js'));
const {
  analyzeAppDelegateFirebaseInit,
  normalizeSwiftAppDelegateFirebaseInit,
} = require('../plugins/nearsyRnfbAppCheckCore');

const EXPO54_SWIFT = `import Expo
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

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

function report(label, contents) {
  const analysis = analyzeAppDelegateFirebaseInit(contents);
  console.log(
    JSON.stringify(
      {
        label,
        appCheckProviderFactoryOccurrences:
          analysis.appCheckProviderFactoryOccurrences,
        firebaseConfigureOccurrences: analysis.firebaseConfigureOccurrences,
        providerFactoryAppearsBeforeFirebaseConfigure:
          analysis.providerFactoryAppearsBeforeFirebaseConfigure,
        ok: analysis.ok,
      },
      null,
      2,
    ),
  );
  return analysis;
}

// BEFORE: stock order that matches Expo dangerous-mod LIFO
// (app registered after app-check → app runs first, then app-check).
const afterApp = modifyApp(EXPO54_SWIFT);
const afterStockAppCheck = modifyAppCheck(afterApp);
const before = report('BEFORE_stock_app_then_app-check', afterStockAppCheck);
assert.equal(before.firebaseConfigureOccurrences, 2, 'expected duplicate configure');
assert.equal(before.ok, false);

// AFTER: Nearsy fix (normalize)
const fixed = normalizeSwiftAppDelegateFirebaseInit(afterStockAppCheck);
const after = report('AFTER_nearsy_normalize', fixed);
assert.equal(after.appCheckProviderFactoryOccurrences, 1);
assert.equal(after.firebaseConfigureOccurrences, 1);
assert.equal(after.providerFactoryAppearsBeforeFirebaseConfigure, true);
assert.equal(after.ok, true);

// Canonical path used in app.config: RNFB app then Nearsy plugin (no stock app-check)
const onlyApp = modifyApp(EXPO54_SWIFT);
const nearsyPath = normalizeSwiftAppDelegateFirebaseInit(onlyApp);
const canonical = report('CANONICAL_app_then_nearsy', nearsyPath);
assert.equal(canonical.ok, true);

console.log(
  JSON.stringify(
    {
      beforeCounts: {
        appCheck: before.appCheckProviderFactoryOccurrences,
        firebase: before.firebaseConfigureOccurrences,
      },
      afterCounts: {
        appCheck: after.appCheckProviderFactoryOccurrences,
        firebase: after.firebaseConfigureOccurrences,
      },
      orderAppCheckBeforeFirebase: after.providerFactoryAppearsBeforeFirebaseConfigure,
      simulationOk: true,
    },
    null,
    2,
  ),
);
