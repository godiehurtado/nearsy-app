/**
 * Resolves the app's own relative imports with Metro's real resolver for the
 * android platform (same metro.config.js as the bundle) and checks each one:
 *  - it resolves at all;
 *  - a platform file never resolves to itself;
 *  - every named/default value import exists in the resolved file's exports.
 *
 * Node tests resolve modules differently from Metro (no `.android.ts`
 * preference), so this is the check that catches a platform file importing
 * itself or a variant missing an export.
 *
 * Usage: node scripts/metroAndroidImportCheck.cjs [--json] [entry ...]
 * Prints paths relative to the workspace and import names only.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '../..');
const metroRequire = (id) => require(require.resolve(id, { paths: [projectRoot] }));

const IMPORT_RE =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]|\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g;

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function parseImports(code) {
  const out = [];
  const src = stripComments(code);
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) {
    if (m[4]) {
      const typeOnly = Boolean(m[2]);
      const clause = m[3];
      const names = [];
      if (m[1] === 'import' && !typeOnly) {
        const braces = clause.match(/\{([\s\S]*)\}/);
        const head = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim();
        if (head && !head.startsWith('*')) names.push('default');
        if (braces) {
          for (const part of braces[1].split(',')) {
            const p = part.trim();
            if (!p || p.startsWith('type ')) continue;
            names.push(p.split(/\s+as\s+/)[0].trim());
          }
        }
      }
      if (m[1] === 'export' && !typeOnly) {
        const braces = clause.match(/^\{([\s\S]*)\}$/);
        if (braces) {
          for (const part of braces[1].split(',')) {
            const p = part.trim();
            if (!p || p.startsWith('type ')) continue;
            names.push(p.split(/\s+as\s+/)[0].trim());
          }
        }
      }
      out.push({ spec: m[4], names, typeOnly });
    } else if (m[5]) out.push({ spec: m[5], names: [], typeOnly: false });
    else if (m[6]) out.push({ spec: m[6], names: [], typeOnly: false, dynamic: true });
  }
  return out;
}

function parseExports(code) {
  const src = stripComments(code);
  const names = new Set();
  let wildcard = false;
  let m;
  const decl =
    /\bexport\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum|abstract\s+class|type|interface)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = decl.exec(src))) names.add(m[1]);
  if (/\bexport\s+default\b/.test(src)) names.add('default');
  const list = /\bexport\s+(type\s+)?\{([^}]*)\}/g;
  while ((m = list.exec(src))) {
    if (m[1]) continue;
    for (const part of m[2].split(',')) {
      const p = part.trim();
      if (!p || p.startsWith('type ')) continue;
      const parts = p.split(/\s+as\s+/);
      names.add((parts[1] ?? parts[0]).trim());
    }
  }
  if (/\bexport\s+\*\s+from\b/.test(src)) wildcard = true;
  if (/\bmodule\.exports\b|\bexports\.[A-Za-z_$]/.test(src)) wildcard = true;
  return { names, wildcard };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const entries = args.filter((a) => !a.startsWith('--'));
  const { loadConfig } = metroRequire('metro-config');
  const DependencyGraph = (m => m.default ?? m)(metroRequire('metro/private/node-haste/DependencyGraph'));
  const config = await loadConfig({ cwd: projectRoot }, {});
  const graph = new DependencyGraph(config, { watch: false });
  await graph.ready();

  const rel = (p) => path.relative(workspaceRoot, p).split(path.sep).join('/');
  const seeds = (entries.length ? entries : ['apps/nearsy-android/index.ts']).map((e) =>
    path.resolve(workspaceRoot, e),
  );
  const visited = new Set();
  const queue = [...seeds];
  const problems = [];
  const edges = [];
  const exportsCache = new Map();
  const exportsOf = (file) => {
    if (!exportsCache.has(file)) exportsCache.set(file, parseExports(fs.readFileSync(file, 'utf8')));
    return exportsCache.get(file);
  };

  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!/\.(t|j)sx?$/.test(file) || file.includes(`${path.sep}node_modules${path.sep}`)) continue;
    for (const imp of parseImports(fs.readFileSync(file, 'utf8'))) {
      // Relative paths and the workspace's own packages; node_modules are not ours.
      if (!/^(\.|@nearsy\/|nearsy-)/.test(imp.spec)) continue;
      let resolved;
      try {
        const res = graph.resolveDependency(
          file,
          { name: imp.spec, data: { key: imp.spec, asyncType: null, isESMImport: true, locs: [] } },
          'android',
          {},
        );
        resolved = res.filePath ?? res;
        if (typeof resolved === 'string') resolved = fs.realpathSync(resolved);
      } catch (err) {
        if (!imp.typeOnly) {
          problems.push({ kind: 'unresolved', from: rel(file), spec: imp.spec });
        }
        continue;
      }
      if (typeof resolved !== 'string') continue;
      edges.push({ from: rel(file), spec: imp.spec, to: rel(resolved) });
      if (path.resolve(resolved) === path.resolve(file)) {
        problems.push({ kind: 'self-import', from: rel(file), spec: imp.spec });
        continue;
      }
      if (imp.names.length && /\.(t|j)sx?$/.test(resolved)) {
        const ex = exportsOf(resolved);
        if (!ex.wildcard) {
          for (const name of imp.names) {
            if (!ex.names.has(name)) {
              problems.push({ kind: 'missing-export', from: rel(file), spec: imp.spec, to: rel(resolved), name });
            }
          }
        }
      }
      if (!imp.typeOnly) queue.push(resolved);
    }
  }
  await graph.end();

  const result = { platform: 'android', files: visited.size, edges, problems };
  if (asJson) process.stdout.write(JSON.stringify(result));
  else {
    console.log(`android: ${visited.size} files, ${edges.length} relative imports, ${problems.length} problems`);
    for (const p of problems) console.log(JSON.stringify(p));
  }
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exitCode = 2;
});
