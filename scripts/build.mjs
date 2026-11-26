import esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(ROOT, 'assets');
const DIST = path.join(ROOT, 'dist');
const isWatch = process.argv.includes('--watch');

function copyStaticAssets() {
  mkdirSync(DIST, { recursive: true });
  cpSync(path.join(SRC, 'manifest.json'), path.join(DIST, 'manifest.json'));

  const iconsSrc = path.join(ASSETS, 'icons');
  if (existsSync(iconsSrc)) {
    cpSync(iconsSrc, path.join(DIST, 'icons'), { recursive: true });
  }

  for (const dir of ['popup', 'options']) {
    const outDir = path.join(DIST, dir);
    mkdirSync(outDir, { recursive: true });
    for (const ext of ['html', 'css']) {
      const file = path.join(SRC, dir, `${dir}.${ext}`);
      if (existsSync(file)) {
        cpSync(file, path.join(outDir, `${dir}.${ext}`));
      }
    }
  }
}

async function runBuild() {
  rmSync(DIST, { recursive: true, force: true });
  copyStaticAssets();

  const shared = {
    bundle: true,
    sourcemap: false,
    minify: !isWatch,
    target: ['chrome114'],
    logLevel: 'info',
  };

  const builds = [
    esbuild.context({
      ...shared,
      entryPoints: [path.join(SRC, 'content', 'index.ts')],
      outfile: path.join(DIST, 'content', 'content.js'),
      format: 'iife',
      loader: { '.css': 'text' },
    }),
    esbuild.context({
      ...shared,
      entryPoints: [path.join(SRC, 'background', 'service-worker.ts')],
      outfile: path.join(DIST, 'background', 'service-worker.js'),
      format: 'esm',
    }),
    esbuild.context({
      ...shared,
      entryPoints: [path.join(SRC, 'popup', 'popup.ts')],
      outfile: path.join(DIST, 'popup', 'popup.js'),
      format: 'iife',
    }),
    esbuild.context({
      ...shared,
      entryPoints: [path.join(SRC, 'options', 'options.ts')],
      outfile: path.join(DIST, 'options', 'options.js'),
      format: 'iife',
    }),
  ];

  const contexts = await Promise.all(builds);

  if (isWatch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    for (const watchTarget of [
      path.join(SRC, 'manifest.json'),
      path.join(SRC, 'popup'),
      path.join(SRC, 'options'),
    ]) {
      watch(watchTarget, { recursive: true }, () => {
        copyStaticAssets();
      });
    }
    console.log('Watching for changes...');
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    console.log('Build complete -> dist/');
  }
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
