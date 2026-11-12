/**
 * Regenerates packages/shared/src/industries/industryCatalogData.ts from the
 * Functions catalog JSON (INDUSTRY_CONTRACT.md §1, Distribution).
 *
 *   node scripts/syncIndustryCatalog.cjs <industry-catalog.v1.json> <functions-sha>
 *
 * Refuses a version that is not an integer, a non-approved catalog, or one
 * that drops an id of the bundled version (ids are never deleted).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [source, sha] = process.argv.slice(2);
if (!source || !/^[0-9a-f]{40}$/.test(sha || '')) {
  console.error('usage: node scripts/syncIndustryCatalog.cjs <catalog.json> <40-char functions sha>');
  process.exit(2);
}
const target = path.resolve(__dirname, '../../../packages/shared/src/industries/industryCatalogData.ts');
const raw = fs.readFileSync(source, 'utf8');
const data = JSON.parse(raw);
if (!Number.isInteger(data.version) || data.status !== 'approved') {
  console.error('catalog must be approved with an integer version');
  process.exit(1);
}
if (fs.existsSync(target)) {
  const previous = fs.readFileSync(target, 'utf8');
  const ids = [...previous.matchAll(/"id": "([a-z][a-z0-9_]*)",\n\s+"sector"/g)].map((m) => m[1]);
  const next = new Set(data.industries.map((item) => item.id));
  const dropped = ids.filter((id) => !next.has(id));
  if (dropped.length > 0) {
    console.error(`catalog drops bundled ids: ${dropped.join(', ')}`);
    process.exit(1);
  }
}
const digest = crypto.createHash('sha256').update(raw).digest('hex');
const out =
  `/**\n * Industry catalog, version ${data.version} (status "${data.status}"), bundled at build time.\n` +
  ' * GENERATED: do not edit by hand. Source: Functions repo\n' +
  ` * docs/industries/industry-catalog.v1.json at ${sha}\n` +
  ` * (sha256 of the JSON: ${digest}).\n` +
  ' * Pinned by the integer version; there is no runtime download.\n */\n' +
  "import type { IndustryCatalogData } from './industryCatalogTypes.ts';\n\n" +
  `export const INDUSTRY_CATALOG_SOURCE_SHA256 = '${digest}';\n\n` +
  `export const INDUSTRY_CATALOG_DATA: IndustryCatalogData = ${JSON.stringify(data, null, 2)};\n`;
fs.writeFileSync(target, out);
console.log(`industry catalog v${data.version}: ${data.industries.length} items, sha256 ${digest}`);
