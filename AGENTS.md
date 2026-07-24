# AGENTS.md

## Cursor Cloud specific instructions

RouteComment is a single client-side React + TypeScript SPA built with Vite. There is no backend, database, or auth — all data lives in-memory or in ZIP files. The only local service is the Vite dev server.

Standard commands are defined in `package.json` scripts and `README.md`:

- Dev server: `npm run dev` (serves at `http://localhost:5173`)
- Lint: `npm run lint` (oxlint; currently emits a couple of non-blocking warnings)
- Test: `npm run test` (Vitest, Node environment — no browser needed)
- Build: `npm run build` (`tsc -b && vite build`)

Non-obvious notes:

- The map basemap (OpenFreeMap) and DEM/elevation tiles (Mapterhorn) are fetched from external HTTPS endpoints at runtime. Core flows (create project, load GPX, draw plans, comments, save/load ZIP) work without them; only visible basemap context, 3D terrain, and elevation-backfill require outbound network access.
- Locale is browser-driven at load time (`navigator.languages`): primary tag `ja` → Japanese, otherwise English. There is no in-app locale switcher. `src/i18n/en.ts` is the source of truth for message keys; `src/i18n/ja.ts` must mirror every key (enforced by `src/i18n/i18n.test.ts`).
