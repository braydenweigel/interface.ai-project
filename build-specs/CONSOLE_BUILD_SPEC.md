# BUILD_SPEC.md — Desktop Console (Electron + React + shadcn)

## 0. Scope

Build a desktop app that is a thin operator console over the replay system
already built in `build-specs/ARTIFACT_BUILD_SPEC.md` (`src/replay/*`,
`src/types/*`, `artifacts/`, `evidence/`). Three flows, one continuous
screen:

1. Pick an artifact from the artifacts directory.
2. Fill in a form generated from that artifact's declared parameters.
3. Run it, and display the structured result — success, business outcome,
   or failure — plus its evidence (screenshot, step log).

**Explicitly out of scope:** artifact authoring/editing, the LLM discovery
loop, guardrail/allowlist enforcement, escalation/handoff UI, live
per-step progress streaming, run-history browsing, and packaging/
signing/auto-update. Don't build any of those now, even if they seem like
natural next steps — stay inside this scope. See §6.

Stack: Electron + React + TypeScript + shadcn/ui (+ Tailwind, which
shadcn requires). The console is a UI in front of the *existing*
Node/Playwright replay system — its main process calls
`run()` from `src/replay/run.ts` directly, in-process. It does not
reimplement, wrap in a second language, or fork any replay logic.

---

## 1. Step 0 — Inspect the existing replay system before designing anything

Do this first, don't skip it. The console's data model is dictated by
what already exists, not the other way around.

- Read `src/replay/run.ts`'s `run(artifactPath, params)` and its
  `RunOutcome` return shape (`exitCode`, `result`, `log`, `screenshotPath`,
  `runId`, `runDir`) — this is exactly, and only, what the UI needs to
  display. Don't invent a different result shape.
- Read `src/types/capability-artifact.ts` — in particular `ParamSpec`
  (`name`, `type`, `required`, `description`, `sensitive`) and
  `OutputSpec`. This file has **no runtime dependencies** (no Node/
  Playwright/zod imports, just plain TS interfaces) — the frontend should
  import these types directly rather than redeclaring them.
- Read the `evidence/<runId>/` layout (`result.json`, `screenshot.png`) —
  written by `run()` for every run regardless of outcome (see
  `docs/artifact-schema.md` and the root `README.md`). This is the
  durable source of truth for a completed run, not stdout.
- Note that Electron's **renderer** process (the Chromium window running
  the React UI) should not be given direct Node/Playwright access — that's
  what the main process is for, and it's also standard Electron security
  practice (`contextIsolation: true`, `nodeIntegration: false`). The
  **main** process, by contrast, is a real Node.js runtime and can `import`
  the replay code directly. Read §2 before writing any UI code.

---

## 2. Architecture — the Electron main↔renderer boundary

This is the one non-obvious decision in this spec; get it settled before
building screens.

- The React renderer must never get direct filesystem/Node/Playwright
  access — no `nodeIntegration: true`, no disabling `contextIsolation`.
  It only ever talks to the main process through a narrow, typed API
  exposed by a preload script via `contextBridge.exposeInMainWorld(...)`
  (e.g. `window.console.runArtifact(...)`, `window.console.listArtifacts()`).
  This is standard Electron security practice, not specific to this app,
  but it matters more than usual here because artifact params can be
  regulated financial data (`sensitive` fields) — the fewer surfaces that
  can touch them, the better.
- The Electron **main** process is a real Node.js runtime, unlike a
  Tauri/Rust backend — it can `import { run } from '../src/replay/run'`
  and call it **in-process**, no child process or CLI shell-out needed.
  Run the main process under the same `tsx` runtime the rest of this repo
  already uses (or precompile `src/` via `tsc` as a build step) so it can
  import the replay TypeScript directly without a separate build for that
  code.
- Expose this as an `ipcMain.handle('run-artifact', ...)` handler,
  invoked from the renderer via the preload-exposed function (which
  wraps `ipcRenderer.invoke('run-artifact', ...)`). Keep the working
  directory (repo root, so `evidence/` lands in the same place it always
  does) and environment (e.g. `HEADFUL` for a visible browser during
  manual testing) on the main-process side.
- `run()`'s return value (the `RunOutcome` — `exitCode`, `result`, `log`,
  `screenshotPath`, `runId`, `runDir`) is already exactly what the
  renderer needs; forward it over IPC as-is. There's no need to
  separately re-read `evidence/<runId>/result.json` back off disk the way
  a subprocess-based design would have to — it's still written to disk as
  the durable/audit record, but the in-memory return value is what the UI
  should render.
- Artifact discovery (listing selectable artifacts, reading their
  `parameters`/`outputs`/`description`/`riskClass` for display) is a
  second `ipcMain.handle`, doing a plain recursive read of
  `artifacts/**/*.json` in the main process — no need to invoke
  `validate-only.ts` for this. `run()` already validates the artifact and
  reports a clean structured failure if the file is malformed; the
  picker's job is just to list what's there, not to duplicate schema
  validation client-side.

---

## 3. Deliverable 1 — Artifact picker

- On launch, list every `*.json` file found recursively under
  `artifacts/` — don't hardcode `artifacts/test/`; future non-test
  artifacts should show up the same way.
- For each, display `capabilityId`, `version`, `description`, and
  `riskClass` read straight from the file, so an operator can tell
  artifacts apart without opening them. (A file that fails to parse as
  JSON can be skipped/flagged in the list — it doesn't need full schema
  validation to be *listed*, just to be *run*, which `run()` already
  handles.)
- Selecting an artifact loads its full parsed shape (`parameters`,
  `outputs`, `checkpoint.description`) into view for the next step.

**Acceptance:** launching the app with the repo's current
`artifacts/test/member-savings-lookup.json` present shows it in the list
with a human-readable description, and selecting it advances to the
parameter form.

---

## 4. Deliverable 2 — Parameter form

Render one field per entry in the selected artifact's
`parameters: ParamSpec[]`, using shadcn form components:

- `type: "boolean"` → a checkbox/switch.
- `type: "number" | "currency"` → a number input.
- `type: "date"` → a date input.
- `type: "string"` → a text input — **except**
- `sensitive: true` → always a password-style masked input, regardless of
  declared type, and never written to any client-side console/log.

Each field shows the `ParamSpec.description` as helper text.
`required: true` fields block submission until filled; `required: false`
fields may be left blank — omit blank optional fields from the params
object passed to the run rather than sending an empty string, matching
`run()`'s own `params: Record<string, ...> = {}` default-omission
behavior (e.g. an unset `slow` boolean should behave the same as not
passing it on the CLI, not as `slow=""`).

**Acceptance:** loading `bank.member.savings-lookup` renders `memberId`,
`username`, `password` as required and `slow` as an optional checkbox;
`password` renders masked; submitting with `memberId` blank is blocked.

---

## 5. Deliverable 3 — Run + result display

- A "Run" action invokes the preload-exposed `runArtifact` call from §2
  with the selected artifact's path and the form's current values,
  disables the form while in flight, and shows a simple pending/spinner
  state. No incremental per-step progress is required — the engine
  doesn't emit intermediate events today, and the `log` array is only
  meaningful once a run has finished (see §6).
- On completion, render:
  - `result.status`, prominently, styled **distinctly** per state
    (`success` / `business_outcome` / `failure`). This three-way
    distinction is the entire point of the artifact schema — the UI must
    not flatten it to a generic pass/fail indicator.
  - `success` → the `outputs` object as a labeled key/value list, using
    each matching `OutputSpec.description` for the label and its
    `sensitive` flag to mask the value in the UI too (even though `run()`
    already redacts sensitive fields server-side — belt-and-suspenders on
    the one thing this whole system treats as regulated data).
  - `business_outcome` → the `outcome` name plus its `outputs`.
  - `failure` → `stepId`, `expected`, and `observed`, verbatim — this is
    meant to be actionable for debugging, don't summarize it away.
  - the run's `screenshot.png` (from `screenshotPath`) as an image — it
    exists for every run regardless of outcome, always show it.
  - the step `log` in a collapsible/secondary panel — useful for
    debugging, not the headline.

**Acceptance:** running the happy-path, business-outcome, and hard-
failure parameter combinations documented in the root `README.md`'s demo
path each render a visibly distinct result state with the correct data,
and each shows a screenshot.

---

## 6. Out of scope reminders (do not build yet)

- No artifact authoring/editing UI — artifacts remain hand-authored JSON
  files edited outside this app.
- No live/streaming per-step progress during a run — only the completed
  result is shown. (Natural next step: have the engine emit incremental
  step events that the main process forwards to the renderer over
  `webContents.send(...)` as it executes — the engine doesn't do this
  today; don't add that plumbing in this phase.)
- No guardrail/allowlist enforcement UI, and no risk-class-based
  confirmation gating on `irreversible` artifacts. `riskClass` is
  displayed, not enforced — a later phase decides what the console does
  with it.
- No escalation/handoff UI — a hard failure here just displays the
  structured result, the same as the CLI already does.
- No run-history browsing of past `evidence/` folders beyond the current
  session's run. Worth noting as a natural extension, not building now.
- No packaging, code signing, or auto-update. Running the app via
  `electron .` (or an equivalent local dev script) is sufficient for this
  phase — no `electron-builder`/`electron-forge` distributable is needed.

If something in Deliverables 3–5 clearly wants one of the above, stub it
as a TODO comment and move on rather than building it now.
