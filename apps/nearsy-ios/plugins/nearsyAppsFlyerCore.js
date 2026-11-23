/**
 * Pure AppDelegate / Podfile helpers for AppsFlyer (contract nc1). No Expo imports.
 *
 * Replaces the stock react-native-appsflyer Expo plugin on purpose. The stock one
 * forwards EVERY URL to AppsFlyerLib (openURL, launch options, any user activity),
 * including OAuth returns (nearsy://linkedin-auth?..., Google/Facebook schemes) at
 * cold start, before JavaScript runs. AppsFlyer has no host allow-list of its own.
 *
 * Nearsy forwards only one thing: an https universal link on the OneLink host and
 * template path, from continueUserActivity. openURL and launch options are never
 * forwarded (there is no OneLink URI-scheme fallback). `super` and RCTLinkingManager
 * still receive everything, so sign-in flows are untouched.
 */

const TAG = '@nearsy/appsflyer-onelink';
const SWIFT_IMPORT = 'import react_native_appsflyer';
const FORWARD_CALL =
  'AppsFlyerAttribution.shared.continueUserActivity(userActivity, restorationHandler: nil)';
const STRICT_FLAG = '$RNAppsFlyerStrictMode=true';

const CONTINUE_SIGNATURE =
  /public override func application\(\s*_ application: UIApplication,\s*continue userActivity: NSUserActivity,\s*restorationHandler: @escaping \(\[UIUserActivityRestoring\]\?\) -> Void\s*\) -> Bool \{/;

function assertHost(host) {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
    throw new Error(`[withNearsyAppsFlyer] Invalid OneLink host: ${host}`);
  }
}

function assertTemplate(template) {
  if (!/^[A-Za-z0-9]{2,16}$/.test(template)) {
    throw new Error(`[withNearsyAppsFlyer] Invalid OneLink template id: ${template}`);
  }
}

function stripNearsyAppsFlyer(contents) {
  let next = contents.replace(
    new RegExp(`[ \\t]*// @generated begin ${TAG}[\\s\\S]*?// @generated end ${TAG}[^\\n]*\\r?\\n?`, 'g'),
    '',
  );
  next = next.replace(/^import react_native_appsflyer\r?\n/gm, '');
  return next;
}

/**
 * @param {string} contents AppDelegate.swift
 * @param {{ enabled: boolean, host?: string, template?: string }} options
 */
function applySwiftAppDelegate(contents, options) {
  let next = stripNearsyAppsFlyer(contents);
  if (!options.enabled) return next;

  assertHost(options.host);
  assertTemplate(options.template);

  const match = CONTINUE_SIGNATURE.exec(next);
  if (!match) {
    throw new Error(
      '[withNearsyAppsFlyer] continueUserActivity not found in AppDelegate.swift (Expo 54 template expected).',
    );
  }
  const guardBlock = [
    `\n    // @generated begin ${TAG}-forward - expo prebuild (do not modify)`,
    '    if NearsyOneLinkFilter.isOneLink(userActivity) {',
    `      ${FORWARD_CALL}`,
    '    }',
    `    // @generated end ${TAG}-forward`,
  ].join('\n');
  const at = match.index + match[0].length;
  next = next.slice(0, at) + guardBlock + next.slice(at);

  next = `${SWIFT_IMPORT}\n${next}`;

  const filter = [
    '',
    `// @generated begin ${TAG}-filter - expo prebuild (do not modify)`,
    '/// Only an https OneLink universal link on Nearsy\'s template reaches AppsFlyer.',
    'enum NearsyOneLinkFilter {',
    `  static let host = "${options.host}"`,
    `  static let templatePath = "/${options.template}"`,
    '',
    '  static func isOneLink(_ userActivity: NSUserActivity) -> Bool {',
    '    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,',
    '          let url = userActivity.webpageURL,',
    '          let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),',
    '          parts.scheme?.lowercased() == "https",',
    '          parts.user == nil, parts.password == nil, parts.port == nil,',
    '          parts.host?.lowercased() == host',
    '    else { return false }',
    '    return parts.path == templatePath || parts.path.hasPrefix(templatePath + "/")',
    '  }',
    '}',
    `// @generated end ${TAG}-filter`,
    '',
  ].join('\n');
  next = next.replace(/\s*$/, '\n') + filter;
  return next;
}

/** @param {string} contents */
function analyzeSwiftAppDelegate(contents) {
  const count = (re) => (contents.match(re) || []).length;
  const forwards = count(/AppsFlyerAttribution\.shared\.continueUserActivity\(/g);
  const guarded = count(
    /if NearsyOneLinkFilter\.isOneLink\(userActivity\) \{\s*AppsFlyerAttribution\.shared\.continueUserActivity\(userActivity, restorationHandler: nil\)\s*\}/g,
  );
  return {
    appsFlyerReferences: count(/AppsFlyer/g),
    continueUserActivityForwards: forwards,
    guardedForwards: guarded,
    handleOpenForwards: count(/AppsFlyerAttribution\.shared\.handleOpen\(/g),
    launchOptionsForwards: count(/AppsFlyerAttribution\.shared\.handleLaunchOptions\(/g),
    imports: count(/^import react_native_appsflyer$/gm),
  };
}

/** Post-condition for both states. */
function assertSwiftAppDelegate(contents, enabled) {
  const a = analyzeSwiftAppDelegate(contents);
  const ok = enabled
    ? a.continueUserActivityForwards === 1 &&
      a.guardedForwards === 1 &&
      a.handleOpenForwards === 0 &&
      a.launchOptionsForwards === 0 &&
      a.imports === 1
    : a.appsFlyerReferences === 0 && a.imports === 0;
  if (!ok) {
    throw new Error(`[withNearsyAppsFlyer] AppDelegate post-condition failed: ${JSON.stringify(a)}`);
  }
  return a;
}

/** Strict mode: AppsFlyerRPC/Strict, no IDFA/AdSupport code. Only when the module is linked. */
function applyPodfile(contents, enabled) {
  const without = contents.replace(
    new RegExp(`# @generated begin ${TAG}-strict[\\s\\S]*?# @generated end ${TAG}-strict\\r?\\n`, 'g'),
    '',
  );
  if (!enabled) return without;
  if (/\$RNAppsFlyerStrictMode\s*=/.test(without)) {
    throw new Error('[withNearsyAppsFlyer] Podfile already sets $RNAppsFlyerStrictMode; refusing to guess.');
  }
  const anchor = without.indexOf('use_expo_modules!');
  if (anchor < 0) throw new Error('[withNearsyAppsFlyer] use_expo_modules! not found in Podfile.');
  const lineStart = without.lastIndexOf('\n', anchor) + 1;
  const block = `# @generated begin ${TAG}-strict - expo prebuild (do not modify)\n${STRICT_FLAG}\n# @generated end ${TAG}-strict\n`;
  return without.slice(0, lineStart) + block + without.slice(lineStart);
}

module.exports = {
  TAG,
  STRICT_FLAG,
  applySwiftAppDelegate,
  analyzeSwiftAppDelegate,
  assertSwiftAppDelegate,
  applyPodfile,
};
