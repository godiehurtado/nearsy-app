/**
 * Validate a generated AppDelegate against the I1-G Firebase init invariant.
 * Usage: node ./scripts/validate-firebase-appdelegate.cjs <path-to-AppDelegate.swift|m>
 */
const fs = require('fs');
const path = require('path');
const {
  analyzeAppDelegateFirebaseInit,
} = require('../plugins/nearsyRnfbAppCheckCore');

const target = process.argv[2];
if (!target) {
  console.error('usage: node validate-firebase-appdelegate.cjs <AppDelegate path>');
  process.exit(2);
}

const abs = path.resolve(target);
const contents = fs.readFileSync(abs, 'utf8');
const analysis = analyzeAppDelegateFirebaseInit(contents);

console.log(
  JSON.stringify(
    {
      file: abs,
      ...analysis,
    },
    null,
    2,
  ),
);

if (!analysis.ok) {
  process.exit(1);
}
