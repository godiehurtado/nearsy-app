/**
 * Pure AppDelegate Firebase init helpers (I1-G).
 * No Expo imports — unit-testable.
 */

const APP_CHECK_CALL = 'RNFBAppCheckModule.sharedInstance()';
const FIREBASE_CONFIGURE_SWIFT = 'FirebaseApp.configure()';
const FIREBASE_CONFIGURE_OBJC = '[FIRApp configure];';

/**
 * Count real Firebase configure call sites (not imports/comments/symbols alone).
 * @param {string} contents
 */
function countFirebaseConfigureCalls(contents) {
  const patterns = [
    /^\s*FirebaseApp\.configure\s*\(/gm,
    /^\s*\[FIRApp\s+configure\s*\]/gm,
    /^\s*\[FIRApp\s+configureWithOptions\s*:/gm,
    /^\s*FIRApp\.configure\s*\(/gm,
  ];
  let count = 0;
  for (const re of patterns) {
    const matches = contents.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * @param {string} contents
 */
function countAppCheckProviderFactoryCalls(contents) {
  const swift = contents.match(/^\s*RNFBAppCheckModule\.sharedInstance\s*\(\s*\)/gm);
  const objc = contents.match(/^\s*\[RNFBAppCheckModule\s+sharedInstance\s*\]/gm);
  return (swift ? swift.length : 0) + (objc ? objc.length : 0);
}

/**
 * @param {string} contents
 */
function analyzeAppDelegateFirebaseInit(contents) {
  const appCheck = countAppCheckProviderFactoryCalls(contents);
  const firebase = countFirebaseConfigureCalls(contents);

  const appCheckIdx = (() => {
    const m = contents.search(
      /^\s*(?:RNFBAppCheckModule\.sharedInstance\s*\(\s*\)|\[RNFBAppCheckModule\s+sharedInstance\s*\])/m,
    );
    return m;
  })();
  const firebaseIdx = (() => {
    const m = contents.search(
      /^\s*(?:FirebaseApp\.configure\s*\(|\[FIRApp\s+configure|FIRApp\.configure\s*\()/m,
    );
    return m;
  })();

  const orderOk =
    appCheck === 1 &&
    firebase === 1 &&
    appCheckIdx >= 0 &&
    firebaseIdx >= 0 &&
    appCheckIdx < firebaseIdx;

  return {
    appCheckProviderFactoryOccurrences: appCheck,
    firebaseConfigureOccurrences: firebase,
    providerFactoryAppearsBeforeFirebaseConfigure: orderOk,
    ok: orderOk,
  };
}

/**
 * Strip prior RNFB / broken App Check init lines and generated duplicate blocks.
 * @param {string} contents
 */
function stripFirebaseInitCalls(contents) {
  let next = contents;

  // Remove known generated regions (app + app-check) then re-emit a single region.
  next = next.replace(
    /[ \t]*\/\/ @generated begin @react-native-firebase\/app-check[\s\S]*?\/\/ @generated end @react-native-firebase\/app-check\r?\n?/g,
    '',
  );
  next = next.replace(
    /[ \t]*\/\/ @generated begin @react-native-firebase\/app-didFinishLaunchingWithOptions[\s\S]*?\/\/ @generated end @react-native-firebase\/app-didFinishLaunchingWithOptions\r?\n?/g,
    '',
  );
  next = next.replace(
    /[ \t]*\/\/ @generated begin @react-native-firebase\/app-didFinishLaunchingWithOptions-fallback[\s\S]*?\/\/ @generated end @react-native-firebase\/app-didFinishLaunchingWithOptions-fallback\r?\n?/g,
    '',
  );
  next = next.replace(
    /[ \t]*\/\/ @generated begin @nearsy\/rnfb-app-check[\s\S]*?\/\/ @generated end @nearsy\/rnfb-app-check\r?\n?/g,
    '',
  );

  // Remove any remaining bare call sites (including the buggy second configure).
  next = next.replace(/^[ \t]*RNFBAppCheckModule\.sharedInstance\s*\(\s*\)[ \t]*\r?\n/gm, '');
  next = next.replace(/^[ \t]*\[RNFBAppCheckModule\s+sharedInstance\s*\];[ \t]*\r?\n/gm, '');
  next = next.replace(/^[ \t]*FirebaseApp\.configure\s*\(\s*\)[ \t]*\r?\n/gm, '');
  next = next.replace(/^[ \t]*\[FIRApp\s+configure\s*\];[ \t]*\r?\n/gm, '');
  next = next.replace(/^[ \t]*\[FIRApp\s+configureWithOptions\s*:[^\]]*\]\s*;[ \t]*\r?\n/gm, '');
  next = next.replace(/^[ \t]*FIRApp\.configure\s*\(\s*\)[ \t]*\r?\n/gm, '');
  next = next.replace(/^[ \t]*import RNFBAppCheck\r?\n/gm, '');

  return next;
}

/**
 * Ensure Swift AppDelegate has exactly:
 *   RNFBAppCheckModule.sharedInstance()
 *   FirebaseApp.configure()
 * before React Native startup, with App Check first.
 * @param {string} contents
 */
function normalizeSwiftAppDelegateFirebaseInit(contents) {
  let next = stripFirebaseInitCalls(contents);

  if (!next.includes('import FirebaseCore')) {
    if (next.includes('import Expo')) {
      next = next.replace(/import Expo\r?\n/, 'import Expo\nimport FirebaseCore\n');
    } else {
      next = `import FirebaseCore\n${next}`;
    }
  }

  const block = [
    '// @generated begin @nearsy/rnfb-app-check - expo prebuild (do not modify)',
    `    ${APP_CHECK_CALL}`,
    `    ${FIREBASE_CONFIGURE_SWIFT}`,
    '// @generated end @nearsy/rnfb-app-check',
  ].join('\n');

  const factoryIdx = next.indexOf('factory.startReactNative(');
  const moduleNameIdx = next.search(/self\.moduleName\s*=\s*"/);

  if (factoryIdx >= 0) {
    next =
      next.slice(0, factoryIdx) +
      `${block}\n    ` +
      next.slice(factoryIdx);
  } else if (moduleNameIdx >= 0) {
    next =
      next.slice(0, moduleNameIdx) +
      `${block}\n    ` +
      next.slice(moduleNameIdx);
  } else {
    throw new Error(
      '[withNearsyRnfbAppCheck] Unable to find insertion point in AppDelegate.swift',
    );
  }

  const analysis = analyzeAppDelegateFirebaseInit(next);
  if (!analysis.ok) {
    throw new Error(
      `[withNearsyRnfbAppCheck] Normalization failed: appCheck=${analysis.appCheckProviderFactoryOccurrences} firebase=${analysis.firebaseConfigureOccurrences} order=${analysis.providerFactoryAppearsBeforeFirebaseConfigure}`,
    );
  }

  return next;
}

/**
 * Obj-C path: App Check sharedInstance before [FIRApp configure] (stock RNFB is usually correct;
 * still normalize to be safe).
 * @param {string} contents
 */
function normalizeObjcAppDelegateFirebaseInit(contents) {
  let next = stripFirebaseInitCalls(contents);

  if (!next.includes('#import <RNFBAppCheckModule.h>')) {
    next = next.replace(
      /#import "AppDelegate.h"/,
      `#import "AppDelegate.h"\n#import <RNFBAppCheckModule.h>`,
    );
  }
  if (!next.includes('#import <Firebase/Firebase.h>')) {
    next = next.replace(
      /#import "AppDelegate.h"/,
      `#import "AppDelegate.h"\n#import <Firebase/Firebase.h>`,
    );
  }

  const block = [
    '// @generated begin @nearsy/rnfb-app-check - expo prebuild (do not modify)',
    `  [RNFBAppCheckModule sharedInstance];`,
    `  ${FIREBASE_CONFIGURE_OBJC}`,
    '// @generated end @nearsy/rnfb-app-check',
  ].join('\n');

  const moduleNameAnchor =
    /self\.moduleName\s*=\s*@"[^"]*";/;
  const fallback =
    /-\s*\(BOOL\)\s*application:\s*\(UIApplication\s*\*\s*\)\s*\w+\s+didFinishLaunchingWithOptions:/;

  if (moduleNameAnchor.test(next)) {
    next = next.replace(moduleNameAnchor, `${block}\n  $&`);
  } else if (fallback.test(next)) {
    next = next.replace(fallback, `$&\n{\n${block}`);
    // fragile; prefer moduleName path
  } else {
    throw new Error(
      '[withNearsyRnfbAppCheck] Unable to find insertion point in AppDelegate.m',
    );
  }

  const analysis = analyzeAppDelegateFirebaseInit(next);
  if (!analysis.ok) {
    throw new Error(
      `[withNearsyRnfbAppCheck] ObjC normalization failed: appCheck=${analysis.appCheckProviderFactoryOccurrences} firebase=${analysis.firebaseConfigureOccurrences}`,
    );
  }

  return next;
}

/**
 * @param {string} contents
 */
function ensureBridgingHeaderAppCheckImport(contents) {
  if (contents.includes('#import <RNFBAppCheckModule.h>')) {
    return contents;
  }
  const trimmed = contents.replace(/\s*$/, '');
  return `${trimmed}\n\n#import <RNFBAppCheckModule.h>\n`;
}

module.exports = {
  APP_CHECK_CALL,
  FIREBASE_CONFIGURE_SWIFT,
  countFirebaseConfigureCalls,
  countAppCheckProviderFactoryCalls,
  analyzeAppDelegateFirebaseInit,
  stripFirebaseInitCalls,
  normalizeSwiftAppDelegateFirebaseInit,
  normalizeObjcAppDelegateFirebaseInit,
  ensureBridgingHeaderAppCheckImport,
};
