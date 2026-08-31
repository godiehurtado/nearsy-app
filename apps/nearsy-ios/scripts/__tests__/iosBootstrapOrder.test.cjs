/**
 * iOS entry bootstrap contract (Hermes / dev-client).
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '../..');
const indexPath = path.join(appRoot, 'index.ts');
const preludePath = path.join(appRoot, 'runtimePrelude.ts');
const indexSource = fs.readFileSync(indexPath, 'utf8');
const preludeSource = fs.readFileSync(preludePath, 'utf8');

function productionQueueMicrotaskReferences(rootDir) {
  const hits = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') {
          continue;
        }
        walk(fullPath);
        continue;
      }

      if (!/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(entry.name)) {
        continue;
      }
      if (fullPath === preludePath) {
        continue;
      }

      const source = fs.readFileSync(fullPath, 'utf8');
      if (/queueMicrotask|global\.queueMicrotask|globalThis\.queueMicrotask/.test(source)) {
        hits.push(path.relative(appRoot, fullPath));
      }
    }
  }

  walk(rootDir);
  return hits;
}

describe('iOS entry bootstrap contract', () => {
  it('loads runtime prelude before gesture-handler and without entry Reanimated', () => {
    const bootstrapImports = indexSource.split('registerRootComponent')[0].trim();

    assert.match(bootstrapImports, /^\/\/ apps\/nearsy-ios\/index\.ts/);
    assert.match(bootstrapImports, /import '\.\/runtimePrelude';/);
    assert.match(
      bootstrapImports,
      /import '\.\/runtimePrelude';\s*\nimport 'react-native-gesture-handler'/,
    );
    assert.doesNotMatch(bootstrapImports, /react-native-reanimated/);
    assert.doesNotMatch(indexSource, /InitializeCore/);
    assert.match(indexSource, /registerRootComponent\(App\)/);
  });

  it('runtimePrelude uses globalThis and does not import app/runtime packages', () => {
    assert.match(preludeSource, /ensureQueueMicrotaskOnTarget\(globalThis/);
    assert.doesNotMatch(preludeSource, /from 'react-native/);
    assert.doesNotMatch(preludeSource, /from 'expo/);
    assert.doesNotMatch(preludeSource, /react-native-reanimated/);
    assert.doesNotMatch(preludeSource, /react-native-worklets/);
    assert.doesNotMatch(preludeSource, /react-native-gesture-handler/);
  });

  it('allows queueMicrotask only in runtimePrelude.ts for apps/nearsy-ios production code', () => {
    const hits = productionQueueMicrotaskReferences(appRoot);
    assert.deepEqual(hits, []);
  });

  it('allows queueMicrotask only in runtimePrelude.ts across shared production source', () => {
    const sharedRoot = path.join(appRoot, '../../packages/shared/src');
    const hits = [];

    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') {
            continue;
          }
          walk(fullPath);
          continue;
        }

        if (!/\.(ts|tsx|js|jsx|cjs|mjs)$/.test(entry.name)) {
          continue;
        }

        const source = fs.readFileSync(fullPath, 'utf8');
        if (/queueMicrotask|global\.queueMicrotask|globalThis\.queueMicrotask/.test(source)) {
          hits.push(path.relative(sharedRoot, fullPath));
        }
      }
    }

    walk(sharedRoot);
    assert.deepEqual(hits, []);
  });
});
