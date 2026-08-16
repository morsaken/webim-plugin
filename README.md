# webim-plugin

CLI for Web-IM builder plugins: scaffold a project, bundle any TypeScript/JSX
source tree into the single-module standard the dashboard accepts, validate it
with the same rules the plugin manager enforces, and push it straight to a
tenant.

## Install

```bash
npm install -g webim-plugin   # global install
npx webim-plugin init my-widget   # or one-off via npx
npm create webim-plugin my-widget # or the create flow
```

Requires Node 18+.

## Usage

```bash
webim-plugin init my-widget   # scaffold: webim-plugin.json, src/, README
cd my-widget
webim-plugin build            # esbuild -> dist/plugin.js + validation
webim-plugin push             # build, sign in, merge into builder_plugins
webim-plugin dev              # watch src/, rebuild + push on every change
```

## Config — `webim-plugin.json`

```json
{
  "entry": "src/index.js",
  "out": "dist/plugin.js",
  "api": "https://your-webim/api",
  "tenant": "your-tenant-slug"
}
```

## Auth for push/dev

Environment variables, never stored in the project:

- `WEBIM_TOKEN` — a Bearer access token (required for accounts with 2FA), or
- `WEBIM_EMAIL` + `WEBIM_PASSWORD` — a normal dashboard sign-in.

The account needs the `settings.tenant` edit grant (owner/admin pass).

## The plugin standard

One ES module, default-exporting:

```js
export default {
  id: 'kebab-slug',            // stable — saved pages reference it
  name: 'Display Name',
  version: '1.0.0',
  blocks: [{
    id: 'kebab-slug',          // stable per plugin
    label: 'Toolbox label',
    props: { /* defaults */ },
    settings: [{ name, label, type }],  // text|number|switch|select|color|image
    mount(el, props, ctx) {},  // ctx = { tenant, apiUrl, locale, settings }
    update(el, props, ctx) {}, // optional — omitted = unmount + mount
    unmount(el) {}             // optional
  }]
};
```

Source can span as many files as you like — `build` flattens them. Keep DOM
work inside `mount`/`update`: the built module is imported in Node during
validation, so module-level `document` access fails the build (on purpose).

Pushing merges by plugin id over the tenant's existing catalog — one plugin
per project, other installed plugins untouched.

## License

[MIT](./LICENSE)
