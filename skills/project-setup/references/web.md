# Web UI

Read this for any React UI: the UI of a Go service and the UI of a TypeScript
full-stack app. Read [typescript](typescript.md) first.

Stack: React, Vite+, shadcn on Base UI, Tailwind CSS v4, Beautiful UI, and
TanStack Query. The UI of a Go service needs nothing more. Do not add a router
framework, a state library, or Effect to it unless a concrete need appears;
use TanStack Router only when the UI has several pages with their own URLs.

## Look and components

The default look is [Beautiful UI](https://www.beautifului.dev)
(`slev12397/beautiful-ui`): a cool near-white canvas, white surfaces, hairline
rings instead of borders, layered low-opacity shadows, a neutral ink ramp, and
sparing semantic color, in light and dark. shadcn on Base UI supplies the
components, and Beautiful UI supplies the tokens and the AI-product
primitives. Use Tailwind CSS v4 through `@tailwindcss/vite`. Install the
`shadcn` skill from `shadcn/ui`.

### Setup

1. Run `shadcn init -b base -p nova` in the UI project root, so components use Base UI
   (`@base-ui/react`) and the `base-nova` style, not Radix.
2. In `components.json`, set `tailwind.css` to `src/styles/shadcn.css` and add
   the registry:

   ```json
   "registries": {
     "@beautifului": "https://www.beautifului.dev/r/{name}.json"
   }
   ```

3. Create `src/styles.css` as the project theme. Copy the `:root` and `.dark`
   token values (`--page`, `--canvas`, `--surface`, `--inset`, `--hover*`,
   `--field`, `--ink*`, `--line*`, `--accent*`, the semantic colors, and
   `--shadow-*`) from the upstream `app/globals.css`. Do not write them from
   memory. Rename `--accent`, `--accent-ink`, and `--accent-tint` to
   `--brand`, `--brand-ink`, and `--brand-tint`: upstream `--accent` is the
   brand blue, and shadcn uses `--accent` for hover backgrounds.

### Two CSS layers

The later layer wins, so the project edits only its own file.

1. `src/styles/shadcn.css` is shadcn CLI output: Tailwind imports, the stock
   shadcn tokens, and their `@theme inline` mapping. Do not edit it. To
   regenerate it, run `shadcn init` again with `--force --no-reinstall`, and
   restore `src/lib/utils.ts` afterwards, because init rewrites it.
2. `src/styles.css` imports `shadcn.css` first. Then it sets the Beautiful UI
   tokens, maps every shadcn token onto them, and adds project utilities.

- Map the shadcn tokens (`--background`, `--primary`, `--accent`, `--border`,
  `--ring`, `--chart-*`, `--sidebar-*`) in the `:root` block of `styles.css`.
  That block comes after the stock `.dark` block, so one mapping applies to
  both themes. In `.dark`, change only the Beautiful UI tokens.
- In `@theme inline`, add only the Beautiful UI tokens, the fonts (Inter and
  JetBrains Mono), and the corner radii that the registry components use
  (`--radius-chip`, `--radius-control`, `--radius-card`). Do not repeat the
  stock mappings from `shadcn.css`.
- The shadcn skill says to edit the `tailwindCssFile` that `shadcn info`
  reports. Ignore that rule; edit `styles.css`.
- **Do not import the Beautiful UI `foundation.css`.** The CLI adds it as a
  registry dependency of every Beautiful UI component; delete it after each
  `add`. It has its own Tailwind import and global element rules, and its
  `--accent` is the brand blue, which breaks the shadcn hover color.

### Components

- `src/components/ui/`: shadcn components. Add or update them with
  `shadcn add <name> --overwrite`.
- `src/components/atoms/`: Beautiful UI primitives. Add or update them with
  `shadcn add @beautifului/<name> --overwrite`. The index is
  `https://www.beautifului.dev/r/registry.json`.
- Treat both directories as external code. Do not edit them, and exclude them
  from lint and format checks. When a component does not fit, change the caller
  or wrap the component outside these directories.
- Use a stock part (`Skeleton`, `Textarea`, `Alert`) before custom markup. In
  new code use `gap-*` instead of `space-*`, `size-*`, `cn()`, and semantic
  tokens instead of raw colors.
- Use the `class` strategy for dark mode, with one theme owner at the root.
- Give every remote surface explicit loading, empty, disabled, and error
  states. Show hover-only actions for a coarse pointer too
  (`pointer-coarse:`).

## Server state: TanStack Query

Fetch and cache all server data with `@tanstack/react-query`. Create one
`QueryClient` at the root and wrap the app in `QueryClientProvider`.

- Do not call `fetch` in components or `useEffect`. Call `useQuery`,
  `useSuspenseQuery`, or `useMutation` with query options that the backend
  layer supplies:
  - Go backend: the options that hey-api generates from the OpenAPI spec (see
    the API contract section of [go](go.md)).
  - TanStack Start: `queryOptions` that call server functions (see
    [ts-fullstack](ts-fullstack.md)).
- Keep query options next to the feature that owns them, so the query key is
  defined in one place. Do not write query keys by hand in components.
- After a mutation, invalidate the queries whose data it changed. Do not copy
  server data into local state.
- Clear the query cache when the signed-in account changes.
- Map `isPending`, empty data, and `error` to explicit loading, empty, and
  error states. Do not hide a failed request behind a default value.
