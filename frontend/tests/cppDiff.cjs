// Differential test for the C/C++ interpreter: every program in tests/cpp/programs is run by the interpreter and its
// output compared with the recorded output of a real compiler.
//   node tests/cppDiff.cjs [filter]          compare against the recorded  <name>.expected  files
//   node tests/cppDiff.cjs --regen [filter]  re-record them with a real compiler (needs `python -m ziglang`, see ZIG_PYTHONPATH)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run } = require('./cppLoad.cjs');

const dir = path.join(__dirname, 'cpp', 'programs');
const args = process.argv.slice(2);
const regen = args.includes('--regen');
const filter = args.find((a) => !a.startsWith('--')) || '';

function compileAndRun(file, lang) {
  const shim = path.join(__dirname, 'cpp', 'shim');
  const exe = path.join(require('node:os').tmpdir(), 'lcv_' + path.basename(file) + '.exe');
  const env = { ...process.env };
  if (process.env.ZIG_PYTHONPATH) env.PYTHONPATH = process.env.ZIG_PYTHONPATH;
  const std = lang === 'c' ? ['cc', '-std=c11'] : ['c++', '-std=c++17'];
  const c = spawnSync('python', ['-m', 'ziglang', ...std, '-w', '-O1', '-fwrapv', '-fno-sanitize=undefined', '-I', shim, file, '-o', exe], { env, encoding: 'utf8' });
  if (c.status !== 0) throw new Error('compile failed:\n' + c.stderr.split('\n').slice(0, 20).join('\n'));
  const r = spawnSync(exe, [], { encoding: 'utf8' });
  return r.stdout.split('\r\n').join('\n');
}

(async () => {
  let failed = 0;
  let count = 0;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!/\.(cpp|c)$/.test(f) || !f.includes(filter)) continue;
    const file = path.join(dir, f);
    const lang = f.endsWith('.c') ? 'c' : 'cpp';
    const expectedFile = file + '.expected';
    if (regen) fs.writeFileSync(expectedFile, compileAndRun(file, lang));
    const expected = fs.readFileSync(expectedFile, 'utf8');
    const r = await run(lang, fs.readFileSync(file, 'utf8'), {}, { maxSteps: 200000, timeoutMs: 60000 });
    count++;
    const got = r.stdout || '';
    if (r.status !== 'SUCCESS' || got !== expected) {
      failed++;
      console.log(`✖ ${f}: ${r.status}${r.error ? ' ' + JSON.stringify(r.error) : ''}`);
      const a = expected.split('\n');
      const b = got.split('\n');
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { console.log(`   line ${i + 1}\n     expected: ${JSON.stringify(a[i])}\n     got:      ${JSON.stringify(b[i])}`); break; }
      }
    } else console.log(`✔ ${f}`);
  }
  console.log(`${count - failed}/${count} programs match the real compiler`);
  process.exit(failed ? 1 : 0);
})();
