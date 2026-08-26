# Capability Console

Desktop operator console for the replay system (`build-specs/CONSOLE_BUILD_SPEC.md`):
pick an artifact, fill in a form generated from its declared parameters,
run it, and see the structured result — success, business outcome, or
failure — plus its screenshot and step log.

Electron + React + TypeScript + shadcn/ui (Tailwind v4). The main process
imports and calls `run()` from `../src/replay/run.ts` directly, in-process
— see `electron/main.ts` and `build-specs/CONSOLE_BUILD_SPEC.md` §2 for
why. The renderer never gets Node/Playwright access; it only talks to the
main process through `window.replayApi`, exposed by `electron/preload.cjs`.

## Setup

```bash
npm install
npx playwright install chromium   # if not already installed at the repo root
```

## Running it

Requires `target-app` running on port 4000 (see the repo root `README.md`):

```bash
cd ../target-app && npm start
```

Then, from `console/`:

```bash
npm run dev
```

This runs the Vite dev server (renderer, port 5173) and the Electron main
process together and opens the app window. Pick `bank.member.savings-lookup`,
fill in `memberId` (e.g. `1001`), `username`, and `password`, and run it.

Runs write evidence to the repo root's `evidence/<runId>/` just like the
CLI (`npx tsx ../src/replay/run.ts ...`) does — they're the same `run()`
function.

### Debugging the main process

`CONSOLE_DEBUG_PORT=9333 npm run dev` opens a Chrome DevTools Protocol
port on the renderer window (useful for connecting Playwright or
`chrome://inspect` to it independently of Electron's own DevTools).

## Layout

- `electron/main.ts` — main process: window creation, the two IPC
  handlers (`list-artifacts`, `run-artifact`).
- `electron/preload.cjs` — the only bridge exposed to the renderer
  (`window.replayApi`). Plain `.cjs` (not `.ts`) because Electron loads
  preload scripts directly, and this package is `"type": "commonjs"`.
- `scripts/start-electron.js` — launches the real Electron binary. Exists
  because some host environments set `ELECTRON_RUN_AS_NODE=1` ambiently,
  which makes Electron run as plain Node instead of the real app runtime;
  this script strips that env var for the child process.
- `src/` — the renderer (React). `components/ArtifactPicker.tsx`,
  `ParameterForm.tsx`, `ResultView.tsx` are the three screens;
  `lib/api.ts` types the `window.replayApi` bridge, importing
  `CapabilityArtifact`/`ParamSpec`/`OutputSpec` directly from the repo
  root's `src/types/capability-artifact.ts` rather than redeclaring them
  (that file has no runtime dependencies, so this costs nothing at build
  time).
- `src/components/ui/` — shadcn/ui component source (Radix primitives +
  Tailwind + `class-variance-authority`).

## Notes

- Not packaged — `npm run dev` is the supported way to run this in the
  current phase (see `build-specs/CONSOLE_BUILD_SPEC.md` §6 for what's
  explicitly out of scope: authoring UI, live per-step progress, guardrail
  enforcement, escalation UI, run history, packaging/signing).
- `zod` here is pinned to match the repo root's exact version
  (`src/types/artifact-schema.zod.ts`, imported indirectly via `run()`,
  is written against the v3 API).
