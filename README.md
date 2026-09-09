# Defect Code Mapping — Voice Agent (frontend)

The P3 claim-status voice agent's pipeline map, defect analysis and tracker
upload. Deployed on Vercel.

The API half lives in its own repository:
**[Defect-Code-Mapping-Voice-backend](https://github.com/Healthplans-ai/Defect-Code-Mapping-Voice-backend)**
— an Express service over a store kept in Azure Blob, plus the Excel importer.
This app is a client of it and has no database of its own.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Run it locally

You need Node.js 22 and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

Both halves have to be running:

```sh
# terminal 1 — the API, from the backend repository
cd ../Defect-Code-Mapping-Voice-backend
npm install && npm run seed && npm run dev     # :8787

# terminal 2 — this app
npm install && npm run dev                     # :8080
```

Copy `.env.example` to `.env` first; it points `VITE_API_URL` at
`http://localhost:8787`.

## What is in it

Point the app at a different API with `VITE_API_URL` in `.env` (default
`http://localhost:8787`).

**No defect is hardcoded here.** Every row is read from the backend, which
reads blob storage, which is populated by uploads — there is no bundled
snapshot to fall back on. So each page distinguishes three situations and says
which one it is: the API is unreachable, the store is live but empty (nothing
imported yet), or here is the data.

| Route | What it does |
| --- | --- |
| `/` | Pipeline + defect map, live from the store. Unmapped rows get their own card. |
| `/analysis` | Filter the tracker and read it back as charts: dates, components, categories, code hotspots, and a sortable row table. |
| `/import` | Drop the tracker `.xlsx`, see a dry-run diff, then apply it. |

Relevant files:

- `src/lib/api.ts` — typed client for the defects API
- `src/hooks/useDefectStore.ts` — react-query hook. Exposes `hasData`,
  `isEmpty` and a `loadError` that folds in react-query's *paused* state, so a
  browser that believes it is offline gets "unreachable" instead of a spinner
  that never resolves.
- `src/components/StoreState.tsx` — the loading / error / empty panels
- `src/lib/analytics.ts` — every metric on `/analysis`, as pure functions over
  the store's rows. No React in here; charts get already-aggregated data.
- `src/components/analysis/` — the panels. `palette.ts` holds the colour
  assignments, `primitives.tsx` the shared panel/legend/bar/heatmap pieces,
  `TimeCharts.tsx` the three recharts plots, `Breakdowns.tsx` the per-component
  stacks and the row table, `FilterBar.tsx` the one filter row.
- `src/routes/import.tsx` — upload, preview and commit
- `src/components/DefectDialog.tsx` — per-component defect list, with inline
  editing for the component / code / confidence / retest / batch of one row

The columns the tracker sheet needs are documented in the
[backend repository](https://github.com/Healthplans-ai/Defect-Code-Mapping-Voice-backend#columns-to-add-to-the-tracker-sheet)
— the importer owns that contract. The `/import` page also serves them live
from `GET /api/schema`.

## The analysis page

`/analysis` reads the same store the map does and slices it every way the sheet
supports. One filter row scopes the whole page — window (with presets and a
custom range), day/week/month bucketing, status, retest verdict, mapping
confidence, component, category and a free-text search — and every panel below
re-renders against that slice, so the numbers always agree. Clicking a component
bar or a category bar filters to it.

Five tabs:

| Tab | What is on it |
| --- | --- |
| **Overview** | Six KPI tiles, the raised-vs-solved timeline, the status and retest splits, defects per component, defects by category |
| **Dates** | The timeline, cumulative backlog, time-from-raised-to-solved bands, age of the open queue, which weekday defects land on |
| **Components** | Per-component stacked status bars, a component × status/retest heatmap, components a fix also touched, and a per-component table with median fix time |
| **Defects & code** | Code hotspots (files ranked by how many defects touched them), mapping confidence, fix batches, tester, team, phase |
| **Rows** | Every row in scope, sortable |

Two things worth knowing about how it reads the data:

- **A column nobody has filled in is not plotted.** If no row in the store
  carries `Solved on`, `Tested By`, `Team` or `Phase`, the panels that read
  those columns are left out and named once instead — a flat zero line looks
  like a finding when it is really an empty column.
- **Code hotspots are parsed out of `Code References`.** That column is prose
  with paths embedded in it, so a path is recognised by its extension:
  `server/twilio_handler.py:2338` counts, `config.TRANSFER_RETRY_SECONDS` does
  not. Line numbers are stripped, so one file is one entry.

Every panel carries a **Table** toggle showing the same numbers as text, and
**Export slice as CSV** downloads whatever the filters currently select.

The aggregation is client-side, in [`src/lib/analytics.ts`](src/lib/analytics.ts) —
pure functions over the rows `/api/store` already returns. That keeps one
implementation of each metric and makes cross-filtering instant, at the cost of
sending the whole store to the browser. It is the right trade at a few hundred
rows; past a few thousand, move the aggregation behind an API endpoint.

## Deploying to Vercel

**Add New → Project**, point it at this repository, then:

- **Framework Preset**: Other. [`vercel.json`](vercel.json) supplies the
  install and build commands (`npm ci`, `npm run build`).
- **Root Directory**: leave it at the repository root — this repo *is* the app.
- **Environment Variables**: nothing to set — the deployed API URL is
  compiled in from `src/lib/api.ts`. To point a deploy somewhere else, set
  `VITE_API_URL` in Project → Settings → Environment Variables; it wins.

[`vite.config.ts`](vite.config.ts) switches Nitro to its `vercel` preset when
`VERCEL=1` is present, which emits the Build Output API v3 layout in
`.vercel/output` — static assets plus one `__server` function for SSR. Vercel
consumes that directly, so there is no output directory to configure.

`VITE_API_URL` is compiled into the bundle at build time, so **changing it
needs a redeploy**, not just a variable edit.

### Where the API URL comes from

`VITE_API_URL` is a build-time value compiled into the client bundle, so it is
not a secret. It resolves in this order:

| Order | Source | Applies to |
| --- | --- | --- |
| 1 | `VITE_API_URL` in the host's environment variables | any build that sets it |
| 2 | `http://localhost:8787` | `vite dev` only |
| 3 | `DEPLOYED_API_URL` in [`src/lib/api.ts`](src/lib/api.ts) | every other build |

The deployed default is a plain string in `src/lib/api.ts` rather than a
`.env.production` file, and that is deliberate. Vercel's
[Vite docs](https://vercel.com/docs/frameworks/frontend/vite#environment-variables)
state that reading a committed `.env` file "requires additional configuration" —
the platform does not pick one up on its own — so a `.env.production` looks like
it should work and silently does not. A string literal in a source file always
survives the build. Change that constant to move the default.

A git-ignored `.env` cannot configure a deploy at all: the host never receives
it. It is for local development only. Note that Vite loads plain `.env` in every
mode, so a local `npm run build` will bake in whatever your `.env` says — which
is what you want for previewing locally, and irrelevant on Vercel, where no
`.env` exists.

### Finish the loop

Once Vercel gives you the production domain, add it to the backend service's
`CORS_ORIGINS` and redeploy that side:

```
https://<your-app>.vercel.app,https://*.vercel.app
```

Until you do, the browser blocks every request and every page shows "the
defect store could not be read". The wildcard entry is what makes preview
deployments work without listing each generated hostname.

### Verifying a deploy

- **`/`** — says "Live from Azure Blob", and the row count is not zero
  (zero means the store is reachable but nothing has been imported).
- **`/analysis`** — the row count in the filter bar matches the store.
- **`/import`** — "Download current data as .xlsx" returns a workbook. This is
  the real end-to-end test: a cross-origin request that streams a file back.

## Chart colours

`src/styles.css` carries three separate palettes, and which one a chart uses
depends on the job the colour is doing:

- `--series-1..3` — **identity**, assigned in that fixed order and never cycled.
- `--good` / `--warning` / `--serious` / `--critical` — **state**. Reserved for
  status and retest; never reused as another series, and always paired with a
  text label, because two of the steps are deliberately below 3:1 contrast.
- `--seq-100..700` — **magnitude**, one hue light-to-dark, for the heatmap and
  the ordered day-bands.

The values were checked against the card surface with the dataviz validator
(colour-blind separation, chroma floor, lightness band, contrast). Re-run it
before hand-tuning a step.

## Build with Lovable

This project is connected to [Lovable](https://lovable.dev). Open it in the
[Lovable editor](https://lovable.dev) and keep building — commits pushed to the
connected branch sync back into the editor, so keep the branch in a working
state and avoid rewriting published history.
