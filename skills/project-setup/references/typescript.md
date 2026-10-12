# TypeScript

Read this for every TypeScript project. Then read the matching reference:

- React UI, including the UI of a Go service: [web](web.md).
- TypeScript backend: [ts-fullstack](ts-fullstack.md), which uses TanStack
  Start.

## TypeScript 7

Use TypeScript 7 for type checks. TypeScript 7.0 has no JavaScript API, so a
tool that imports `typescript` (for example `@hey-api/openapi-ts` 0.99) fails
with it. Install TypeScript 6 under the `typescript` name for those tools, and
TypeScript 7 under an alias, as the TypeScript 7.0 release notes describe:

```json
"devDependencies": {
  "typescript": "npm:@typescript/typescript6@^6.0.2",
  "@typescript/native": "npm:typescript@^7.0.2"
}
```

`tsc` then runs TypeScript 7, and `tsc6` runs TypeScript 6. Run type checks
with `tsc`. Remove the TypeScript 6 alias when every tool that imports
`typescript` supports TypeScript 7. Enable `strict` in `tsconfig.json`.

## Toolchain: Vite+

[Vite+](https://viteplus.dev) (`vite-plus`, CLI `vp`) provides the dev server,
build, Vitest, Oxlint, and Oxfmt. Create a project with `vp create`, or convert
one with `vp migrate`. Keep the lint and format configuration in the `lint`
and `fmt` sections of `vite.config.ts`. Do not add ESLint, Prettier, or
separate `.oxlintrc` and `.oxfmtrc` files.

Call `vp` through mise tasks. Add `vp check`, `tsc --noEmit`, `vp test`, and
`vp build` to `mise run check`.

## anti-slop

Install the plugin with the `install-anti-slop` skill from
`dmmulroy/anti-slop`. It copies the plugin into `tools/oxlint/anti-slop/` and
installs `@oxlint/plugins` at the exact version of the Oxlint that Vite+
uses. Then:

- Register the plugin under `jsPlugins` in the `lint` section of
  `vite.config.ts`.
- Enable the `correctness`, `suspicious`, and `perf` categories as errors.
- Enable the generic anti-slop rules. Enable the Effect rules only when the
  project depends on Effect.
- Keep `UPSTREAM.md` and the vendored licenses.
