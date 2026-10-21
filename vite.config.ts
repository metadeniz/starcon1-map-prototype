import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Puts the script into the page itself, so the built page also works when opened as a file
 * (double-clicked): browsers refuse to load a separate module script from a file:// page.
 */
function inlineScript(): Plugin {
  return {
    name: 'inline-script',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const tag = new RegExp(`<script type="module"[^>]*src="[^"]*${chunk.fileName}"[^>]*></script>`);
        if (!tag.test(page)) continue;
        // A function replacement, so "$" in the code isn't read as a pattern.
        page = page.replace(tag, () => `<script type="module">${chunk.code.replace(/<\/script/gi, '<\\/script')}</script>`);
        delete bundle[chunk.fileName];
      }
      html.source = page;
    },
  };
}

export default defineConfig(({ mode }) => ({
  // `npm run build:file` makes dist-file/index.html: one self-contained page, images included.
  ...(mode === 'file'
    ? {
        base: './',
        plugins: [inlineScript()],
        build: { outDir: 'dist-file', assetsInlineLimit: Number.MAX_SAFE_INTEGER, modulePreload: false },
      }
    : {}),
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
