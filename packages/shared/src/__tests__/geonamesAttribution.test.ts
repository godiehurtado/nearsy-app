/**
 * IOS-208-CURRENT-CITY-QA-01 — GeoNames CC BY 4.0 attribution in Settings.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import enSettings from '../i18n/resources/settings';
import es from '../i18n/locales/es';
import {
  GEONAMES_ATTRIBUTION_URL,
  openGeoNamesAttribution,
} from '../settings/geonamesAttribution';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('GeoNames attribution copy', () => {
  it('EN text is exact', () => {
    assert.equal(
      enSettings.about.geonamesAttribution,
      'City data © GeoNames (https://www.geonames.org), licensed under CC BY 4.0. Modified: filtered and re-indexed by Nearsy.',
    );
    assert.equal(enSettings.sections.about, 'About');
  });

  it('ES text is exact', () => {
    assert.equal(
      es.settings.about.geonamesAttribution,
      'Datos de ciudades © GeoNames (https://www.geonames.org), con licencia CC BY 4.0. Modificados: filtrados y reindexados por Nearsy.',
    );
    assert.equal(es.settings.sections.about, 'Acerca de');
  });
});

describe('GeoNames link', () => {
  it('URL is exactly https://www.geonames.org', () => {
    assert.equal(GEONAMES_ATTRIBUTION_URL, 'https://www.geonames.org');
  });

  it('opens the exact URL with openURL and never consults canOpenURL', async () => {
    const opened: string[] = [];
    let canOpenCalls = 0;
    const opener = {
      openURL: async (url: string) => {
        opened.push(url);
      },
      canOpenURL: async () => {
        canOpenCalls += 1;
        return true;
      },
    };
    assert.equal(await openGeoNamesAttribution(opener), 'opened');
    assert.deepEqual(opened, ['https://www.geonames.org']);
    assert.equal(canOpenCalls, 0);
  });

  it('an opener failure is reported, not thrown', async () => {
    const result = await openGeoNamesAttribution({
      openURL: async () => {
        throw new Error('no browser');
      },
    });
    assert.equal(result, 'failed');
  });

  it('the opener module has no canOpenURL, embedded browser, tracking or logs', () => {
    const src = read('settings/geonamesAttribution.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /canOpenURL|WebBrowser|WebView|openBrowserAsync|analytics|console\./);
    assert.match(src, /isAllowedDiscoverySocialHttpsUrl/);
  });
});

describe('Settings surface', () => {
  const more = read('screens/MoreScreen.tsx');

  it('lives in the existing Settings hub, in an About section', () => {
    assert.match(more, /t\('settings\.sections\.about'\)/);
    assert.match(more, /note=\{t\('settings\.about\.geonamesAttribution'\)\}/);
    assert.match(more, /onPress=\{handleOpenGeoNames\}/);
    assert.match(more, /accessibilityRole="link"/);
    assert.match(more, /openGeoNamesAttribution\(Linking\)/);
    assert.doesNotMatch(more, /canOpenURL/);
  });

  it('the attribution note wraps for large text (no line cap) and uses theme colors', () => {
    const row = read('components/settings/SettingsRow.tsx');
    const noteBlock = row.slice(row.indexOf('{note ?'), row.indexOf(') : null}', row.indexOf('{note ?')));
    assert.doesNotMatch(noteBlock, /numberOfLines/);
    assert.match(noteBlock, /palette\.textMuted/);
    assert.match(row, /accessibilityLabel = \[title, value, note\]/);
  });
});
