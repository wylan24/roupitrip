import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Emits sw.js with the list of built app-shell files to precache. */
function serviceWorker(): Plugin {
  return {
    name: 'roupitrip-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.startsWith('tesseract/'));
      const shell = ['./', 'index.html', 'manifest.webmanifest', 'rates.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', ...built];
      const unique = [...new Set(shell)];
      const version = createHash('sha256').update(unique.join('\n')).digest('hex').slice(0, 12);
      const body = readFileSync('src/sw.js', 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const VERSION = '${version}';\nconst PRECACHE = ${JSON.stringify(unique)};\n${body}`,
      });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', sourcemap: true },
  plugins: [serviceWorker()],
  test: { include: ['tests/**/*.test.ts'] },
});
