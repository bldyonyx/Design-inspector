import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Separate unpacked extension build; the normal production entry is untouched.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react(), tailwindcss(), {
    name: 'experiment-index',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const html = bundle['experiments/font-preview/index.html'];
        if (html?.type === 'asset') {
          this.emitFile({ type: 'asset', fileName: 'index.html', source: html.source });
          delete bundle['experiments/font-preview/index.html'];
        }
      },
    },
  }],
  build: {
    outDir: '/tmp/design-inspector-font-preview',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) },
  },
});
