#!/usr/bin/env node
/* eslint-disable no-console */
// webim-plugin — the Web-IM builder plugin CLI.
//
//   webim-plugin init [dir]     scaffold a plugin project
//   webim-plugin build          bundle src/ into dist/plugin.js and validate it
//   webim-plugin push           build + upload to the tenant's builder_plugins
//   webim-plugin dev            watch src/, rebuild and push on every change
//
// The build target is the SINGLE-MODULE STANDARD the dashboard's plugin
// manager accepts (see ui components/builder/plugins/runtime.js): one ES
// module whose default export is { id, name, version, blocks: [{ id, label,
// props, settings, mount(el, props, ctx), update?, unmount? }] }. Write
// TypeScript/JSX across as many files as you like — esbuild flattens them.
//
// Auth for push: WEBIM_TOKEN (a Bearer access token) or WEBIM_EMAIL +
// WEBIM_PASSWORD (a normal dashboard sign-in; accounts with 2FA must use
// WEBIM_TOKEN). The account needs the settings.tenant edit grant — owner or
// admin roles pass automatically.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = 'webim-plugin.json';

const HELP = `webim-plugin — Web-IM builder plugin CLI

Commands:
  init [dir]   scaffold a plugin project (webim-plugin.json, src/, README)
  wrap [dir]   convert an EXISTING project: add config, an adapter entry
               (Shadow-DOM boilerplate, React-aware) and WEBIM_PLUGIN.md —
               the plugin contract written as rules for AI assistants
  build        bundle the entry into dist/plugin.js and validate it
  push         build, then upload to the tenant's builder_plugins setting
  dev          watch the source; rebuild and push on every change

Config (webim-plugin.json):
  { "entry": "src/index.js", "out": "dist/plugin.js",
    "api": "http://localhost:4100/api", "tenant": "root" }

Auth (push/dev): WEBIM_TOKEN, or WEBIM_EMAIL + WEBIM_PASSWORD.`;

// ---------------------------------------------------------------------------
// scaffolding

const TEMPLATE_CONFIG = (name) => `${JSON.stringify(
  { entry: 'src/index.js', out: 'dist/plugin.js', api: 'http://localhost:4100/api', tenant: 'root' },
  null,
  2
)}\n`;

const TEMPLATE_PLUGIN = (id, name) => `// ${name} — a Web-IM builder plugin.
//
// One module is the whole plugin. Split code into as many files as you like
// ("webim-plugin build" bundles them), use TypeScript or JSX if you prefer —
// only this default export shape is the contract.

export default {
  id: '${id}',
  name: '${name}',
  version: '1.0.0',
  blocks: [
    {
      id: 'card',
      label: '${name}',
      // Default prop values — what a freshly dropped block starts with.
      props: { title: 'Hello from ${name}', color: '#6366f1' },
      // Typed fields the builder's Inspector renders for this block.
      // Types: text | number | switch | select | color | image
      settings: [
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'color', label: 'Color', type: 'color' }
      ],
      /**
       * Renders the block. \`el\` is yours until unmount; \`ctx\` is
       * { tenant, apiUrl, locale, settings }.
       */
      mount(el, props, ctx) {
        el.innerHTML = '';

        const card = document.createElement('div');

        card.style.cssText = 'padding:18px 22px;border-radius:10px;color:#fff;font-weight:600;';
        card.style.background = props.color || '#6366f1';
        card.textContent = props.title || '${name}';
        el.appendChild(card);
      },
      /** Called when props change in the editor; omit to remount instead. */
      update(el, props, ctx) {
        const card = el.firstChild;

        if (!card) return this.mount(el, props, ctx);
        card.style.background = props.color || '#6366f1';
        card.textContent = props.title || '${name}';
      },
      unmount(el) {}
    }
  ]
};
`;

const TEMPLATE_README = (id, name) => `# ${name}

A Web-IM builder plugin. Develop:

\`\`\`bash
npm install
npx webim-plugin build   # bundle + validate -> dist/plugin.js
npx webim-plugin push    # upload to the tenant in webim-plugin.json
npx webim-plugin dev     # watch + rebuild + push
\`\`\`

Set credentials for push: \`WEBIM_TOKEN\`, or \`WEBIM_EMAIL\` + \`WEBIM_PASSWORD\`.
`;

const TEMPLATE_PACKAGE = (id) => `${JSON.stringify(
  {
    name: id,
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: { build: 'webim-plugin build', push: 'webim-plugin push', dev: 'webim-plugin dev' },
    devDependencies: { 'webim-plugin': '^1.1.0' },
    // npm >= 11.17 blocks dependency install scripts unless allowlisted;
    // esbuild works without its postinstall, this just silences the warning.
    allowScripts: { esbuild: true }
  },
  null,
  2
)}\n`;

async function init(dirArg) {
  const dir = path.resolve(dirArg ?? '.');
  const id = path
    .basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'my-plugin';
  const name = id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  if (existsSync(path.join(dir, CONFIG_FILE))) {
    throw new Error(`${CONFIG_FILE} already exists in ${dir}`);
  }

  await mkdir(path.join(dir, 'src'), { recursive: true });
  await writeFile(path.join(dir, CONFIG_FILE), TEMPLATE_CONFIG(name));
  await writeFile(path.join(dir, 'src', 'index.js'), TEMPLATE_PLUGIN(id, name));
  await writeFile(path.join(dir, 'README.md'), TEMPLATE_README(id, name));
  await writeFile(path.join(dir, 'WEBIM_PLUGIN.md'), TEMPLATE_GUIDE(id, name, 'src/index.js'));

  if (!existsSync(path.join(dir, 'package.json'))) {
    await writeFile(path.join(dir, 'package.json'), TEMPLATE_PACKAGE(id));
  }

  console.log(`Scaffolded "${id}" in ${dir}`);
  console.log('Next: edit webim-plugin.json (api/tenant), then `webim-plugin build`.');
}

// ---------------------------------------------------------------------------
// wrap — convert an existing project into a plugin

/**
 * The plugin contract written as rules for AI assistants. Dropped into the
 * project by `wrap` (and referenced from AGENTS.md/CLAUDE.md by the user) so
 * any model editing the project builds a valid plugin on the first try.
 */
const TEMPLATE_GUIDE = (id, name, entry) => `# Web-IM plugin rules — ${name}

Directives for AI assistants (and humans) working on the Web-IM builder
plugin in this project. Follow every MUST. The plugin entry is \`${entry}\`;
\`npx webim-plugin build\` bundles it to \`dist/plugin.js\` and validates it.

## The contract

The entry module's **default export** is the whole plugin:

\`\`\`js
export default {
  id: '${id}',            // kebab-case slug, /^[a-z0-9-]+$/
  name: '${name}',
  version: '1.0.0',
  blocks: [{
    id: 'main',           // kebab-case slug
    label: '${name}',     // shown in the builder Toolbox/Inspector
    props: { /* default prop values for a freshly dropped block */ },
    settings: [ /* typed Inspector fields, see below */ ],
    mount(el, props, ctx) {},   // REQUIRED — render into el
    update(el, props, ctx) {},  // optional — props changed; omit to get unmount+mount
    unmount(el) {}              // optional — cleanup
  }]
};
\`\`\`

\`ctx\` is \`{ tenant, apiUrl, locale, settings }\`.

\`settings\` fields are \`{ name, label, type }\` with type one of
\`text | number | switch | select | color | image\`; \`select\` also takes
\`options: [{ value, label }]\` (or plain strings). Every setting's \`name\`
must have a default in \`props\`.

## Build pipeline facts

- Everything must land in ONE ES module — \`push\` uploads only the built JS.
- \`import\` of \`.css\`/\`.html\` files yields the file content as a STRING
  (inject a \`<style>\` tag / parse markup yourself at mount time).
- Images and fonts (\`.svg .png .jpg .jpeg .gif .webp .woff .woff2\`) import
  as \`data:\` URLs.
- After bundling, the CLI IMPORTS the bundle in Node.js to validate it.
  Module scope therefore MUST NOT touch \`document\`, \`window\`,
  \`localStorage\`, or run any DOM code. All DOM work goes inside \`mount()\`.
  Guard any standalone auto-init with \`typeof document !== 'undefined'\`.

## Rendering rules (MUST)

1. Render inside a Shadow DOM:
   \`const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' })\` —
   the host clears \`el.innerHTML\` between remounts but an attached shadow
   root SURVIVES, so always reuse it and reset with \`shadow.innerHTML = ''\`.
2. Never style or mutate \`document\`, \`document.body\`, or
   \`document.documentElement\` (no classes, no attributes, no global CSS).
   The single exception: webfont \`<link>\` tags may be appended to
   \`document.head\` (deduplicate first) — \`@font-face\` is inert inside a
   shadow root.
3. If reusing an app's page-level stylesheet, rescope it to a wrapper div
   inside the shadow: \`body\`/\`html\`/\`:root\` selectors → the wrapper class,
   \`position: fixed\` → \`absolute\`, \`100vw/100vh\` → \`100%\`. Give the
   wrapper \`position: relative; overflow: hidden\`.
4. The same block can be mounted MULTIPLE times on one page: no module-level
   singletons or mutable shared state — key per-instance state by \`el\`
   (e.g. a \`WeakMap\`). Element IDs inside the shadow root are fine.
5. \`unmount()\` must undo everything attached outside the shadow root:
   \`document\`/\`window\` listeners, timers, observers, animation-frame
   loops, open sockets.
6. \`update()\` runs on every Inspector prop edit. When in-place diffing is
   not trivial, destroy + remount — correctness beats cleverness.
7. Network calls: use plain \`fetch\`; never assume same-origin cookies.
   Degrade gracefully — a failed request must not blank the block.

## Converting an existing app (checklist)

- [ ] Write the adapter entry (\`${entry}\`) — it maps builder props to the
      app's options and boots the app inside the shadow root.
- [ ] Remove the app's assumption that it owns the page: inject its markup
      into the wrapper, query elements from the shadow root (note:
      \`getElementById\` exists on ShadowRoot), move body-level classes and
      theme attributes onto the wrapper.
- [ ] For outside-click handlers on \`document\`, use
      \`e.composedPath()[0]\` — \`e.target\` retargets to the host element.
- [ ] Expose the app's config as \`settings\` + \`props\` defaults; pass them
      explicitly so the host page's URL params never leak in.
- [ ] \`npx webim-plugin build\` passes, then test mount/update/unmount and
      two instances on one page.

## Ship

\`\`\`bash
npx webim-plugin build   # bundle + validate -> dist/plugin.js
npx webim-plugin push    # upload to the tenant in webim-plugin.json
npx webim-plugin dev     # watch + rebuild + push
\`\`\`

Auth for push: \`WEBIM_TOKEN\`, or \`WEBIM_EMAIL\` + \`WEBIM_PASSWORD\`.
`;

/** Vanilla adapter skeleton — builds and renders a placeholder as generated. */
const TEMPLATE_WRAP_VANILLA = (id, name, ts) => {
  const el = ts ? 'el: HTMLElement' : 'el';
  const props = ts ? 'props: Record<string, any>' : 'props';
  const ctx = ts ? 'ctx: { tenant?: string; apiUrl?: string; locale?: string }' : 'ctx';

  return `// ${name} — Web-IM builder plugin adapter (entry for \`webim-plugin build\`).
// Read WEBIM_PLUGIN.md before editing: it is the contract and the rules.
//
// CSS imports arrive as strings under the webim-plugin CLI, e.g.:
//   import cssText from './styles.css';

function mountBlock(${el}, ${props}, ${ctx}) {
  // The host clears el.innerHTML between remounts but a shadow root survives.
  const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = \`
    :host { display: block; }
    .root { position: relative; overflow: hidden; font-family: system-ui, sans-serif; }
  \`; // TODO: append your (rescoped) stylesheet string here

  const root = document.createElement('div');
  root.className = 'root';
  // TODO: render your app into \`root\` (markup, components, listeners).
  root.textContent = \`${name} — replace mountBlock() with your app\`;

  shadow.append(style, root);
}

export default {
  id: '${id}',
  name: '${name}',
  version: '1.0.0',
  blocks: [
    {
      id: 'main',
      label: '${name}',
      // TODO: defaults for every settings field below.
      props: { title: '${name}' },
      // Inspector fields: text | number | switch | select | color | image.
      settings: [{ name: 'title', label: 'Title', type: 'text' }],
      mount(${el}, ${props}, ${ctx}) {
        mountBlock(el, props, ctx);
      },
      update(${el}, ${props}, ${ctx}) {
        // Props changed. Remount is the simple correct default.
        mountBlock(el, props, ctx);
      },
      unmount(${el}) {
        // TODO: remove document/window listeners, timers, observers.
        if (el.shadowRoot) el.shadowRoot.innerHTML = '';
      }
    }
  ]
};
`;
};

/** React adapter skeleton — builds as generated; wire the real component in. */
const TEMPLATE_WRAP_REACT = (id, name, ts) => {
  const el = ts ? 'el: HTMLElement' : 'el';
  const props = ts ? 'props: Record<string, any>' : 'props';
  const ctx = ts ? 'ctx: { tenant?: string; apiUrl?: string; locale?: string }' : 'ctx';
  const rootsType = ts ? '<HTMLElement, Root>' : '';

  return `// ${name} — Web-IM builder plugin adapter (entry for \`webim-plugin build\`).
// Read WEBIM_PLUGIN.md before editing: it is the contract and the rules.
import { createRoot${ts ? ', type Root' : ''} } from 'react-dom/client';
// TODO: import your component and render it in mountBlock, e.g.:
// import App from './App';
//
// CSS imports arrive as strings under the webim-plugin CLI, e.g.:
//   import cssText from './styles.css';

const roots = new WeakMap${rootsType}();

function mountBlock(${el}, ${props}, ${ctx}) {
  // The host clears el.innerHTML between remounts but a shadow root survives.
  const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = ':host { display: block; }'; // TODO: + your rescoped stylesheet string

  const container = document.createElement('div');
  shadow.append(style, container);

  const root = createRoot(container);
  roots.set(el, root);
  // TODO: replace the placeholder with your component, e.g. <App {...props} />
  root.render(<div style={{ fontFamily: 'system-ui' }}>${name} — wire your component into mountBlock()</div>);
}

export default {
  id: '${id}',
  name: '${name}',
  version: '1.0.0',
  blocks: [
    {
      id: 'main',
      label: '${name}',
      // TODO: defaults for every settings field below.
      props: { title: '${name}' },
      // Inspector fields: text | number | switch | select | color | image.
      settings: [{ name: 'title', label: 'Title', type: 'text' }],
      mount(${el}, ${props}, ${ctx}) {
        mountBlock(el, props, ctx);
      },
      update(${el}, ${props}, ${ctx}) {
        mountBlock(el, props, ctx);
      },
      unmount(${el}) {
        roots.get(el)?.unmount();
        roots.delete(el);
        if (el.shadowRoot) el.shadowRoot.innerHTML = '';
      }
    }
  ]
};
`;
};

const TEMPLATE_MODULE_DECLS = `// The webim-plugin CLI bundles .css and .html imports as plain strings
// (esbuild \`text\` loader); images and fonts import as data: URLs.
declare module '*.css' {
  const text: string;
  export default text;
}
declare module '*.html' {
  const text: string;
  export default text;
}
`;

/**
 * Converts an existing project in place: writes webim-plugin.json, an adapter
 * entry matched to the project (TS? React?) and WEBIM_PLUGIN.md. Only ever
 * CREATES files — an existing file with a target name aborts or is skipped.
 */
async function wrap(dirArg) {
  const dir = path.resolve(dirArg ?? '.');

  if (existsSync(path.join(dir, CONFIG_FILE))) {
    throw new Error(`${CONFIG_FILE} already exists in ${dir} — this project is already wired up`);
  }

  let pkg = {};

  try {
    pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    // no package.json is fine — fall back to the directory name
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const isReact = 'react' in deps;
  const isTS = existsSync(path.join(dir, 'tsconfig.json')) || 'typescript' in deps;
  const ext = isReact ? (isTS ? 'tsx' : 'jsx') : isTS ? 'ts' : 'js';

  const id = String(pkg.name ?? path.basename(dir))
    .toLowerCase()
    .replace(/^@[^/]+\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'my-plugin';
  const name = id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const srcDir = existsSync(path.join(dir, 'src')) ? 'src' : '.';
  const entry = `${srcDir === '.' ? '' : 'src/'}webim.${ext}`;
  const entryFile = path.join(dir, entry);

  if (existsSync(entryFile)) throw new Error(`${entry} already exists in ${dir}`);

  await mkdir(path.dirname(entryFile), { recursive: true });
  await writeFile(path.join(dir, CONFIG_FILE), `${JSON.stringify(
    { entry, out: 'dist/plugin.js', api: 'http://localhost:4100/api', tenant: 'root' },
    null,
    2
  )}\n`);
  await writeFile(entryFile, (isReact ? TEMPLATE_WRAP_REACT : TEMPLATE_WRAP_VANILLA)(id, name, isTS));

  const created = [CONFIG_FILE, entry];

  if (isTS) {
    const decls = path.join(dir, srcDir, 'webim-modules.d.ts');

    if (!existsSync(decls)) {
      await writeFile(decls, TEMPLATE_MODULE_DECLS);
      created.push(path.relative(dir, decls));
    }
  }

  if (!existsSync(path.join(dir, 'WEBIM_PLUGIN.md'))) {
    await writeFile(path.join(dir, 'WEBIM_PLUGIN.md'), TEMPLATE_GUIDE(id, name, entry));
    created.push('WEBIM_PLUGIN.md');
  }

  console.log(`Wrapped "${id}" (${isReact ? 'React' : 'vanilla'}${isTS ? ' + TypeScript' : ''}) — created ${created.join(', ')}`);
  console.log(`Next:
  1. Wire your app into ${entry} — WEBIM_PLUGIN.md has the contract and rules.
     Working with an AI assistant? Point it at WEBIM_PLUGIN.md (reference it
     from AGENTS.md / CLAUDE.md so it is picked up automatically).
  2. Edit ${CONFIG_FILE} (api/tenant), then \`npx webim-plugin build\`.`);
}

// ---------------------------------------------------------------------------
// build + validate

async function loadConfig() {
  const file = path.resolve(CONFIG_FILE);

  if (!existsSync(file)) throw new Error(`No ${CONFIG_FILE} here — run \`webim-plugin init\` first`);

  const config = JSON.parse(await readFile(file, 'utf8'));

  return {
    entry: config.entry ?? 'src/index.js',
    out: config.out ?? 'dist/plugin.js',
    api: config.api ?? 'http://localhost:4100/api',
    tenant: config.tenant ?? ''
  };
}

// Everything must land in ONE JS module — the only thing push uploads. CSS
// and HTML come in as strings (inject a <style> / parse markup at mount),
// images and fonts as data: URLs.
const LOADERS = {
  '.css': 'text',
  '.html': 'text',
  '.svg': 'dataurl',
  '.png': 'dataurl',
  '.jpg': 'dataurl',
  '.jpeg': 'dataurl',
  '.gif': 'dataurl',
  '.webp': 'dataurl',
  '.woff': 'dataurl',
  '.woff2': 'dataurl'
};

async function bundle(config) {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [config.entry],
    outfile: config.out,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    minify: false,
    logLevel: 'silent',
    // Modern JSX runtime (React 17+/Vite default): .jsx/.tsx files work
    // without a manual `import React` in every file.
    jsx: 'automatic',
    loader: LOADERS
  });

  if (result.errors.length) throw new Error(result.errors.map((e) => e.text).join('\n'));

  return config.out;
}

/**
 * The same rules the dashboard's packPlugin enforces (keep in sync with
 * ui components/builder/plugins/runtime.js) — failing here beats failing in
 * the manager after an upload.
 */
function validatePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') throw new Error('The module must default-export the plugin object');
  if (typeof plugin.id !== 'string' || !/^[a-z0-9-]+$/.test(plugin.id)) {
    throw new Error('`id` must be a kebab-case slug');
  }
  if (typeof plugin.name !== 'string' || !plugin.name.trim()) throw new Error('`name` is required');
  if (!Array.isArray(plugin.blocks) || !plugin.blocks.length) throw new Error('`blocks` must be a non-empty array');

  for (const block of plugin.blocks) {
    if (!block || typeof block !== 'object') throw new Error('Every block must be an object');
    if (typeof block.id !== 'string' || !/^[a-z0-9-]+$/.test(block.id)) {
      throw new Error('Every block needs a kebab-case `id`');
    }
    if (typeof block.label !== 'string' || !block.label.trim()) throw new Error(`Block "${block.id}" needs a label`);
    if (typeof block.mount !== 'function') throw new Error(`Block "${block.id}" needs a mount(el, props, ctx) function`);
  }

  return {
    id: plugin.id,
    name: plugin.name,
    version: typeof plugin.version === 'string' ? plugin.version : '1.0.0',
    blocks: plugin.blocks.map((block) => ({
      id: block.id,
      label: block.label,
      props: block.props && typeof block.props === 'object' ? block.props : {},
      settings: Array.isArray(block.settings)
        ? block.settings.filter((field) => field && typeof field.name === 'string')
        : []
    }))
  };
}

async function build() {
  const config = await loadConfig();
  const out = await bundle(config);
  // Import the BUILT code: what ships is what gets validated. Module-level
  // DOM access would fail right here — keep DOM work inside mount(). A data:
  // URL instead of the file path so Node always parses it as ESM — a file
  // import would inherit the project's package.json "type", and a project
  // without "type": "module" breaks on the bundle's export statement.
  const code = await readFile(path.resolve(out), 'utf8');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const manifest = validatePlugin(mod?.default);

  console.log(`Built ${out}`);
  console.log(
    `  ${manifest.name} v${manifest.version} (${manifest.id}) — blocks: ${manifest.blocks
      .map((block) => block.id)
      .join(', ')}`
  );

  return { config, out, manifest };
}

// ---------------------------------------------------------------------------
// push

async function api(config, pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${config.api}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(config.tenant ? { 'x-tenant': config.tenant } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.success === false) {
    const error = data?.error ?? {};

    throw new Error(`${method} ${pathname} failed: ${error.code ?? response.status} ${error.message ?? ''}`.trim());
  }

  return data?.payload;
}

async function resolveToken(config) {
  if (process.env.WEBIM_TOKEN) return process.env.WEBIM_TOKEN;

  const email = process.env.WEBIM_EMAIL;
  const password = process.env.WEBIM_PASSWORD;

  if (!email || !password) {
    throw new Error('Set WEBIM_TOKEN, or WEBIM_EMAIL and WEBIM_PASSWORD, to push');
  }

  const session = await api(config, '/auth/login', { method: 'POST', body: { email, password } });
  const token = session?.session?.access?.token;

  if (!token) throw new Error('Login succeeded but no access token came back');

  return token;
}

async function push() {
  const { config, out, manifest } = await build();
  const token = await resolveToken(config);
  const code = await readFile(path.resolve(out), 'utf8');

  // A personal access token is TENANT-BOUND: authed routes write to the
  // token's tenant and ignore X-Tenant. Ask /me who we really are and refuse
  // a mismatch — a silent cross-tenant push is how catalogs get polluted.
  const me = await api(config, '/me', { token });
  const actualTenant = me?.tenant?.slug;

  if (config.tenant && actualTenant && (actualTenant !== config.tenant)) {
    throw new Error(
      `This credential acts on tenant "${actualTenant}" but webim-plugin.json says "${config.tenant}" — ` +
        'use a token minted in the right tenant, or fix the config'
    );
  }

  // Merge over the tenant's existing catalog — pushing one plugin must not
  // wipe the others.
  const rows = await api(config, '/settings/tenant', { token });
  const current = Array.isArray(rows) ? rows.find((row) => row?.key === 'builder_plugins')?.value : null;
  const plugins = current && typeof current.plugins === 'object' ? { ...current.plugins } : {};

  plugins[manifest.id] = { code, manifest };

  await api(config, '/settings/builder_plugins', {
    method: 'PUT',
    token,
    body: { value: { plugins }, is_public: true }
  });

  console.log(`Pushed ${manifest.id} v${manifest.version} to tenant "${actualTenant ?? config.tenant}" (${config.api})`);
}

// ---------------------------------------------------------------------------
// dev (watch)

async function dev() {
  const config = await loadConfig();
  const esbuild = await import('esbuild');
  const context = await esbuild.context({
    entryPoints: [config.entry],
    outfile: config.out,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    logLevel: 'silent',
    jsx: 'automatic',
    loader: LOADERS,
    plugins: [
      {
        name: 'webim-push',
        setup(buildHook) {
          buildHook.onEnd(async (result) => {
            if (result.errors.length) {
              console.error(result.errors.map((e) => e.text).join('\n'));

              return;
            }

            try {
              await push();
            } catch (err) {
              console.error(String(err?.message ?? err));
            }
          });
        }
      }
    ]
  });

  await context.watch();
  console.log(`Watching ${config.entry} — every change rebuilds and pushes to "${config.tenant}". Ctrl-C to stop.`);
}

// ---------------------------------------------------------------------------

const [command, argument] = process.argv.slice(2);

try {
  if ((command === '--version') || (command === '-v')) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

    console.log(pkg.version);
  } else if (command === 'init') await init(argument);
  else if (command === 'wrap') await wrap(argument);
  else if (command === 'build') await build();
  else if (command === 'push') await push();
  else if (command === 'dev') await dev();
  else console.log(HELP);
} catch (err) {
  console.error(`Error: ${err?.message ?? err}`);
  process.exit(1);
}
