# Documentation

Copy these rules into `.agents/rules/documentation.md` and link the file from
the root `AGENTS.md`. Remove the Fumadocs part when the repository has no
public documentation site.

## Layout

```
README.md                 # entry point: what it is, quick start, links
docs/
  dev/
    README.md             # index of developer documents
    architecture.md       # modules, boundaries, data flow (with a figure)
    development.md        # set up, run, debug; refers to mise tasks
    testing.md            # how to run each test tier; links the testing rule
    decisions/
      0001-<slug>.md      # one ADR per decision
  <topic>.md              # user and operator guides
assets/
  src/<name>.md           # figure sources (DocumD)
  <name>.png              # rendered figures
.local/                   # temporary reports and notes; ignored by Git
```

- **README.md** is short. It says what the project does, how to run it in
  three commands or fewer, and where the other documents are.
- **docs/dev/** is for people who change the code. Each document describes the
  current state. Delete or update a section when the code changes; do not add
  a "changes" section.
- **ADRs** record a decision that is hard to reverse: context, options,
  decision, consequences. Do not edit an accepted ADR; supersede it with a new
  one and link both ways.
- **.local/** holds plans, review notes, and run reports. Add it to
  `.gitignore`. Move a result to `docs/` only when it stays true.

## Writing rules

- Write for one reader per document. State the reader and the goal in the
  first paragraph.
- Write procedures as numbered steps, one action per step. Put the condition
  before the action. End with how to check that the procedure worked.
- Use `mise run <task>` in commands. Do not copy the task body into a
  document, because the copy becomes out of date.
- Use exact names: file paths, task names, environment variables, and API
  fields in backticks.
- Link to the source of truth (code, schema, OpenAPI spec) instead of
  repeating it. Generate reference documents from it when possible.
- Write English in ASD-STE100 style: short sentences, active voice, one
  meaning per word.

## Figures with DocumD

Draw architecture, flows, sequences, and state machines with DocumD. Install
the `documd-visuals` skill and read it before you draw.

1. Write the source as one diagram file, for example
   `assets/src/request-flow.puml` or `.mmd`.
2. Render it with the `docs:figures` task, which runs
   `documd assets/src/<name>.<ext> assets/<name>.png` for each source. DocumD
   exits with status 1 when a figure fails.
3. Embed the PNG in the document and link the source next to it:

   ```markdown
   ![Request flow](../assets/request-flow.png)

   Source: [request-flow.puml](../assets/src/request-flow.puml)
   ```

4. Look at the rendered PNG before you commit. Fix overlaps and cut labels.
5. Commit the source and the PNG in the same commit.

GitHub and Fumadocs do not render DocumD blocks, so documents embed the PNG.
Add a `check:figures` task that fails when a source has no PNG or a PNG has no
source. Do not compare rendered bytes; renders differ between machines.

## Public docs with Fumadocs

Use [Fumadocs](https://fumadocs.dev) for a public documentation site. Use
`fumadocs-core`, `fumadocs-mdx`, and `fumadocs-ui` at pinned versions.

- **TypeScript full stack:** serve the docs from the TanStack Start app under
  `/docs`. Add the `fumadocs-mdx/vite` plugin to `vite.config.ts`.
- **Go service:** put the docs in a separate Vite+ app (for example `site/`)
  and deploy it as a static site. Do not embed it into the Go binary.

```
content/docs/
  meta.json               # navigation for this folder
  index.mdx
  quickstart.mdx
  guides/
    meta.json
    deploy.mdx
source.config.ts          # defineDocs({ dir: "content/docs" })
```

- Each page has `title` and `description` in its frontmatter. The site uses
  them for the page header, search, and link previews.
- `meta.json` owns navigation. List pages in `pages` in reading order. Use
  `"---Label---"` entries for section separators. A page that is not in
  `pages` does not show in the sidebar.
- Write pages for users. Keep developer documents in `docs/dev/`.
- Generate API reference pages from `api/openapi.yaml`. Do not write them by
  hand.
- Run `fumadocs-mdx` (task `docs:generate`) before `tsc`, because it writes
  the typed collections in `.source/`. Ignore `.source/` in Git and in dprint.

### Translations

Add a second language only when a user needs it. Put the translation next to
the source: `quickstart.zh.mdx` and `meta.zh.json`. Change both languages in
the same commit. Add a test that fails when a page or a `meta.json` entry
exists in one language and not in the other.

## Verification

- Run `mise run format` and `dprint check`.
- Check links. Every relative link and image path must resolve.
- For Fumadocs, run `docs:generate`, `tsc`, and the build. Open the changed
  pages in a browser and look at them.
- For figures, open each changed PNG.
