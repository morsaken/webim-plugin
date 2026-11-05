# Changelog

`webim-plugin` and `create-webim-plugin` are released together.

## 1.4.0 — 2026-11-05

### webim-plugin

- A platform push (`"platform": true`) uploads only its own plugin
  (`PUT /settings/global/builder_plugins/plugins/:id`); the API merges it into
  the library and keeps the workspaces it is offered to. The old way re-sent
  every plugin's code and stopped at the API's body limit (413) once the
  library passed 8 MB. Against an API without the new route it falls back to
  the full write.

### create-webim-plugin

- Released with webim-plugin 1.4.0; no changes.

## 1.3.0 — 2026-11-01

### webim-plugin

- `"platform": true` in `webim-plugin.json` pushes into the platform library
  instead of a workspace (root's master token only; checked before the
  request). A new library plugin is offered to no workspace until root picks
  them; later pushes keep the choice.
- A plugin's `actions` (`[{ id, label }]`) are carried into its manifest, so
  the builder's Plugin action list can offer them.
- `push` prints the id the server stored the plugin under — a workspace's new
  plugin may be tagged with its address (`weather--acme`).
- The `bin` path is written `bin/webim-plugin.js`: npm 11.17 drops a `./bin/…`
  entry when publishing, which would ship without the command.

### create-webim-plugin

- Depends on `webim-plugin` ^1.3.0. Same `bin` path fix.

## 1.2.0

- Previous release.
