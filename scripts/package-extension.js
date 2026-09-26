// Zips the extension's actual runtime files (not tests/scripts/CI config)
// into dist/autofill-assistant-v<version>.zip — the file you'd sideload elsewhere or
// attach to a GitHub Release. Run via `npm run package`.
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const INCLUDE = ['manifest.json', 'background', 'content', 'icons', 'options', 'popup'];

const distDir = path.join(ROOT, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, `autofill-assistant-v${manifest.version}.zip`);
const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`✓ Packaged ${archive.pointer()} bytes -> ${path.relative(ROOT, outPath)}`);
});
archive.on('error', (err) => {
  throw err;
});
archive.pipe(output);

INCLUDE.forEach((entry) => {
  const full = path.join(ROOT, entry);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) archive.directory(full, entry);
  else archive.file(full, { name: entry });
});

archive.finalize();
