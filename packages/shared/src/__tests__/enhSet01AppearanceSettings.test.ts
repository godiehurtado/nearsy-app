/**
 * ENH-SET-01 — appearance preference contracts (storage + first-run gate).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPEARANCE_STORAGE_KEY } from '../theme/themeStorage';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

test('ENH-SET-01: appearance storage key stays nearsy.appearance', () => {
  assert.equal(APPEARANCE_STORAGE_KEY, 'nearsy.appearance');
});

test('ENH-SET-01: ThemeContext commitTheme persists via saveAppearance', () => {
  const ctx = readShared('theme/ThemeContext.tsx');
  assert.match(ctx, /commitTheme/);
  assert.match(ctx, /saveAppearance\(t\)/);
  assert.match(ctx, /loadAppearance/);
  assert.match(ctx, /hasChosenTheme/);
});

test('ENH-SET-01: guest gate still routes missing preference to ThemeSelection', () => {
  const nav = readShared('navigation/AppNavigator.tsx');
  assert.match(nav, /hasChosenTheme/);
  assert.match(nav, /ThemeSelection/);
  assert.match(nav, /if \(!hasChosenTheme\) return 'ThemeSelection'/);
});

test('ENH-SET-01: themeStorage only accepts clear|dark', () => {
  const storage = readShared('theme/themeStorage.ts');
  assert.match(storage, /stored === 'clear' \|\| stored === 'dark'/);
  assert.match(storage, /APPEARANCE_STORAGE_KEY = 'nearsy\.appearance'/);
});
