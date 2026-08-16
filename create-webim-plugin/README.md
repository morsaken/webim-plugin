# create-webim-plugin

The `npm create` flow for [webim-plugin](https://www.npmjs.com/package/webim-plugin):

```bash
npm create webim-plugin my-widget
```

is exactly `webim-plugin init my-widget` — it scaffolds a Web-IM builder
plugin project (`webim-plugin.json`, `src/`, README). Everything else
(`build`, `push`, `dev`) lives in the `webim-plugin` CLI; see its README.

> **Note:** on npm ≥ 11.17, installing the scaffolded project's dependencies
> may print an `allow-scripts` warning about esbuild's postinstall script.
> It's safe to ignore — esbuild's platform binary is installed via
> `optionalDependencies`, so builds work without the script. To silence it,
> add `"allowScripts": { "esbuild": true }` to the project's `package.json`.

## License

[MIT](https://github.com/morsaken/webim-plugin/blob/master/LICENSE)
