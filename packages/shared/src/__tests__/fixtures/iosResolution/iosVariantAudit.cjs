// For every relative, extensionless import that Metro resolves to a .ios.ts(x)
// variant on iOS, check that the variant exports every imported name, and that
// no .ios file imports itself.
const fs = require('fs');
const path = require('path');
const root = process.argv[2];

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p);
  }
})(root);

function exportsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().replace(/^type\s+/, '').trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+\*\s+from/.test(src)) names.add('*');
  if (/export\s+default/.test(src)) names.add('default');
  return names;
}

const problems = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\s+(type\s+)?(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s+['"](\.[^'"]+)['"]/g)) {
    const [, typeOnly, def, named, spec] = m;
    if (path.extname(spec)) continue;
    const base = path.resolve(path.dirname(file), spec);
    const ios = ['.ios.ts', '.ios.tsx'].map((e) => base + e).find((p) => fs.existsSync(p));
    if (!ios) continue;
    const rel = (p) => path.relative(root, p).replace(/\\/g, '/');
    if (path.resolve(ios) === path.resolve(file)) {
      problems.push(`${rel(file)} imports itself via '${spec}'`);
      continue;
    }
    if (typeOnly) continue;
    const exported = exportsOf(ios);
    if (exported.has('*')) continue;
    const wanted = (named || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('type '))
      .map((s) => s.split(/\s+as\s+/)[0].trim());
    if (def) wanted.push('default');
    for (const name of wanted) {
      if (!exported.has(name)) problems.push(`${rel(file)} imports '${name}' from '${spec}' but ${rel(ios)} does not export it`);
    }
  }
}
process.stdout.write(JSON.stringify(problems));
