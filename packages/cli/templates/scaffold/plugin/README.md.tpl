# @atrium-plugin/{{name}}

{{title}} — an Atrium plugin scaffolded by `atrium new-plugin {{name}}`.

```bash
pnpm install
atrium new-component {{name}}-card --level block --plugin {{name}}
atrium new-provider email my-esp --plugin {{name}}
pnpm --filter @atrium-plugin/{{name}} test
```

Export new components/renderers/drivers from `src/index.ts`, then add
`"@atrium-plugin/{{name}}": "workspace:*"` to the hosts that should load it and call
`registerPlugin()` during startup. See docs/CONTRIBUTING.md#plugins.
