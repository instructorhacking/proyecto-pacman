# AGENTS.md

## Project & tooling

PacMan-like arcade game: vanilla JS + HTML + CSS, no framework. There is **no build system, no `package.json`, no tests, no linter, no formatter** — never invent `npm`/`yarn`/`make` commands. Verification is manual only: open `src/index.html` in a browser (works over `file://`, no server needed) and check the console is clean.

## Spec-driven workflow (important)

Features are designed and built through two pinned skills (see `skills-lock.json` and `.agents/skills/`):

- `/spec <description>` — clarifies scope with the user, then writes `specs/NN-slug.md` (numbered, zero-padded). **Never writes code.** Specs start as `Draft`; only the user flips them to `Approved`.
- `/spec-impl <NN-slug>` — implements only specs whose state means "Approved" (any language). Creates branch `spec-NN-slug`, then implements the plan one step at a time, pausing for diff review. **Never commits on its own.**

New specs must match the language and section wording of existing specs in `specs/` (the folder doesn't exist yet; first spec is `01-`). If `specs/.spec-config.yml` exists, leave it untouched. Don't hand-edit `.agents/skills/` — those files are hash-pinned in `skills-lock.json`.

## Architecture: plain scripts, no modules

JS files are classic browser scripts loaded by `<script>` tags in `src/index.html`, **in this order** (each depends on the previous file's globals):

1. `maze.js` — maze data; exposes `MAZE`, `TUNNEL_ROW`, `PACMAN_START`, `GHOST_STARTS` on `window`
2. `game.js` — state + rules; exposes `createGame`, `update`, `DIRS`
3. `render.js` — canvas drawing; exposes `draw`
4. `main.js` — loop, keyboard, overlays; consumes everything above

Do not introduce ES modules/imports — wiring is via `window.*` globals. A new JS file needs a `<script>` tag added in `src/index.html` (position matters) or it won't load.

## Maze data invariants

- `MAZE` (28×31) is the pristine shared copy; **never mutate it**. `createGame()` copies it into `game.grid` per game so dots can be eaten and restarts work.
- Cell values: `0` empty, `1` wall, `2` dot, `3` ghost-pen door (wall for Pacman, passable for ghosts).
- Row 14 is the wrap-around tunnel; exiting through the side edges is valid and wraps.
- `render.js` draws from `game.grid` (not `MAZE`) so eaten dots disappear — keep it that way.
- Tile size 20 px; canvas 560×620 = 28×31 tiles. Maze coordinates `(x, y)`, origin top-left.

## Conventions

- Comments, UI text, and specs are in **Spanish** — keep new ones in Spanish.
- Code style (nothing enforces it): single quotes, spaces inside parens `( x )`, 2-space indent. Match the surrounding code.
