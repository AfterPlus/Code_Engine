// Parses every JavaScript file of the frontend (ES modules and classic scripts) with the vendored acorn, so a
// syntax slip is caught without a browser:  node frontend/tests/syntaxCheck.cjs
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('../js/vendor/acorn.js');

const root = path.join(__dirname, '..');
const skip = new Set(['vendor', 'node_modules']);
let failures = 0;
let files = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    const moduleLike = /^\s*(import|export)\s/m.test(text) || entry.name.endsWith('.mjs');
    files++;
    try {
      acorn.parse(text, { ecmaVersion: 'latest', sourceType: moduleLike ? 'module' : 'script', allowHashBang: true, allowReturnOutsideFunction: true });
    } catch (e) {
      failures++;
      console.error(`${path.relative(root, full)}:${e.loc ? e.loc.line + ':' + e.loc.column : ''} ${e.message}`);
    }
  }
}

walk(root);
console.log(`${files} files checked, ${failures} with syntax errors`);
process.exit(failures ? 1 : 0);
