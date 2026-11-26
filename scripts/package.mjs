import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');

if (!existsSync(DIST)) {
  console.error('dist/ does not exist. Run "npm run build" first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'));
const version = manifest.version || '1.0.0';

mkdirSync(RELEASE, { recursive: true });
const zipPath = path.join(RELEASE, `llm-queue-v${version}.zip`);
if (existsSync(zipPath)) {
  rmSync(zipPath);
}

// Cross-platform zip creation using Python's built-in zipfile module
const pyScript = [
  'import pathlib, sys, zipfile',
  'dist = pathlib.Path(sys.argv[1])',
  'out = pathlib.Path(sys.argv[2])',
  'with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:',
  '    for p in sorted(dist.rglob("*")):',
  '        if p.is_file():',
  '            zf.write(p, p.relative_to(dist).as_posix())',
].join('\n');

const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
execFileSync(pythonBin, ['-c', pyScript, DIST, zipPath], { stdio: 'inherit' });
console.log(`Packaged Chrome Web Store zip -> ${zipPath}`);
