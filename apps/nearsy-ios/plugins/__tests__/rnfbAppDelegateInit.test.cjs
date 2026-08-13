/**
 * Regression tests for I1-G Firebase AppDelegate initialization invariant.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  analyzeAppDelegateFirebaseInit,
  normalizeSwiftAppDelegateFirebaseInit,
  countFirebaseConfigureCalls,
  countAppCheckProviderFactoryCalls,
} = require('../nearsyRnfbAppCheckCore');

const BASE_SWIFT = `import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

/** Mirrors the buggy RNFB 23.8.6 app-check Swift insertion (two configures). */
const BUGGY_DUPLICATE = `import Expo
import FirebaseCore
import React

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let factory = ExpoReactNativeFactory(delegate: ReactNativeDelegate())
    // @generated begin @react-native-firebase/app-didFinishLaunchingWithOptions - expo prebuild (do not modify)
    FirebaseApp.configure()
    // @generated end @react-native-firebase/app-didFinishLaunchingWithOptions
        RNFBAppCheckModule.sharedInstance()
        FirebaseApp.configure()
      
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
    return true
  }
}
`;

describe('nearsyRnfbAppCheckCore — I1-G invariant', () => {
  it('detects duplicate FirebaseApp.configure from stock app-check Swift bug', () => {
    const analysis = analyzeAppDelegateFirebaseInit(BUGGY_DUPLICATE);
    assert.equal(analysis.firebaseConfigureOccurrences, 2);
    assert.equal(analysis.appCheckProviderFactoryOccurrences, 1);
    assert.equal(analysis.providerFactoryAppearsBeforeFirebaseConfigure, false);
    assert.equal(analysis.ok, false);
  });

  it('normalizes buggy AppDelegate to App Check → single configure', () => {
    const normalized = normalizeSwiftAppDelegateFirebaseInit(BUGGY_DUPLICATE);
    const analysis = analyzeAppDelegateFirebaseInit(normalized);
    assert.equal(analysis.appCheckProviderFactoryOccurrences, 1);
    assert.equal(analysis.firebaseConfigureOccurrences, 1);
    assert.equal(analysis.providerFactoryAppearsBeforeFirebaseConfigure, true);
    assert.equal(analysis.ok, true);
  });

  it('normalizes bare Expo AppDelegate', () => {
    const normalized = normalizeSwiftAppDelegateFirebaseInit(BASE_SWIFT);
    assert.equal(countAppCheckProviderFactoryCalls(normalized), 1);
    assert.equal(countFirebaseConfigureCalls(normalized), 1);
    assert.equal(analyzeAppDelegateFirebaseInit(normalized).ok, true);
  });

  it('fails analysis when Firebase configure is missing', () => {
    const onlyAppCheck = BASE_SWIFT.replace(
      'factory.startReactNative(',
      'RNFBAppCheckModule.sharedInstance()\n    factory.startReactNative(',
    );
    const analysis = analyzeAppDelegateFirebaseInit(onlyAppCheck);
    assert.equal(analysis.firebaseConfigureOccurrences, 0);
    assert.equal(analysis.ok, false);
  });

  it('does not count import FirebaseCore as a configure call', () => {
    assert.equal(countFirebaseConfigureCalls('import FirebaseCore\n'), 0);
  });
});
