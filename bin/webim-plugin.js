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
import { pathToFileURL } from 'node:url';

const CONFIG_FILE = 'webim-plugin.json';

const HELP = `webim-plugin — Web-IM builder plugin CLI

Commands:
  init [dir]   scaffold a plugin project (webim-plugin.json, src/, README)
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
    devDependencies: { 'webim-plugin': '^0.1.0' }
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

  if (!existsSync(path.join(dir, 'package.json'))) {
    await writeFile(path.join(dir, 'package.json'), TEMPLATE_PACKAGE(id));
  }

  console.log(`Scaffolded "${id}" in ${dir}`);
  console.log('Next: edit webim-plugin.json (api/tenant), then `webim-plugin build`.');
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
    logLevel: 'silent'
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
  // Import the BUILT file: what ships is what gets validated. Module-level
  // DOM access would fail right here — keep DOM work inside mount().
  const mod = await import(`${pathToFileURL(path.resolve(out)).href}?v=${Date.now()}`);
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
  else if (command === 'build') await build();
  else if (command === 'push') await push();
  else if (command === 'dev') await dev();
  else console.log(HELP);
} catch (err) {
  console.error(`Error: ${err?.message ?? err}`);
  process.exit(1);
}
