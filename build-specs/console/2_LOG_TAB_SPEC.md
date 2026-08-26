# 2_LOG_TAB_SPEC.md — Evidence Log Tab (Console, Phase 2)

## 0. Scope

`1_CONSOLE_SPEC.md` built a single continuous flow (pick artifact → fill
form → run → see result) and explicitly deferred history browsing:
"No run-history browsing of past `evidence/` folders beyond the current
session's run. Worth noting as a natural extension, not building now."
This spec is that extension.

Add a second tab to the console, **Log**, next to the existing run flow
(**Run**), that lists every past run recorded under `evidence/` and lets
an operator open one to see exactly what the Run tab would have shown
them at the time: the three-way result, the screenshot, and the step
log. This is a read-only viewer over `evidence/` — it does not re-run
anything, and it does not replace `evidence/<runId>/result.json` as the
source of truth.

**Explicitly out of scope:** editing or deleting evidence records,
live-streaming updates to the list while a run is in progress elsewhere
in the app, pagination/virtualization (the take-home's `evidence/`
directory is small; don't build for scale it doesn't have), server-side
search/filtering, exporting/zipping evidence, and any kind of retention
or cleanup policy (that's what `npm run clear-evidence` is already for).
See §6.

---

## 1. Step 0 — Inspect what already exists before building

Do this first — the Log tab is a second view over data structures that
already exist; nothing about its data model is new.

- Read `src/replay/run.ts`'s `run()` (the `evidenceRecord` it writes to
  `evidence/<runId>/result.json`):
  ```
  {
    runId,            // "<capabilityId, sanitized>.<ISO timestamp, sanitized>"
    artifactPath,      // the path the run was invoked with, e.g. "artifacts/test/member-savings-lookup.json"
    capabilityId,
    capabilityVersion,
    params,            // sensitive params already redacted to "[REDACTED]"
    result,            // same ReplayResult union the Run tab already renders
    log,               // ReplayLogEntry[]
    screenshotPath      // sibling evidence/<runId>/screenshot.png, absolute path
  }
  ```
  Note what's *missing* from this record: the artifact's full `outputs`/
  `businessOutcomes` specs (needed to label output values with their
  `description` and `sensitive` flag the way `ResultView` does today).
  Only `artifactPath` is recorded. §2 covers how the main process
  reconstructs enough of the artifact for display, and what to do when it
  can't.
- Read `console/src/components/ResultView.tsx`. It already renders the
  exact three-way distinction this tab needs (success/business_outcome/
  failure, screenshot, collapsible log) — **reuse it, don't reimplement
  it**. Its current props (`artifact: CapabilityArtifact`,
  `outcome: RunOutcome`, `onRunAgain`, `onChooseDifferent`) will need
  small adjustments — see §5.
- Note `statusMeta()` inside `ResultView.tsx` (the label/icon/color per
  `result.status`) is currently a private function local to that file.
  The list view in §4 needs the same status→color/icon mapping for its
  badges. Extract it to a shared module (e.g. `src/lib/status.ts`) that
  both `ResultView.tsx` and the new list component import, rather than
  copy-pasting the switch statement.
- Read `console/electron/main.ts`'s existing `list-artifacts` and
  `run-artifact` handlers, in particular how `run-artifact` base64-encodes
  the screenshot into a `screenshotDataUrl` before returning it, because
  Chromium refuses to load a `file://` image into a page served from
  `http://localhost:5173` (different origins). The same technique applies
  here.
- Read `console/src/App.tsx`'s current state machine
  (`screen: 'picker' | 'form' | 'result'`). It has no tab concept today;
  §3 adds one *around* it, not inside it — the existing three screens
  become the content of the "Run" tab, unchanged.

---

## 2. Architecture — new IPC surface, same boundary rules as §2 of `1_CONSOLE_SPEC.md`

No new architectural pattern here — same main↔renderer split, same
`contextBridge`-exposed `window.replayApi`, two more handlers on it.

- **`ipcMain.handle('list-evidence-runs', ...)`** — recursively list
  `evidence/*/result.json`, parse each, and return a lightweight summary
  per run: `{ runId, runDir, capabilityId, capabilityVersion, status,
  timestamp, artifactPath }`. Do **not** include the full `log`/`outputs`/
  screenshot in the list response — those are fetched lazily per-run in
  the next handler, the same "list is cheap, detail is fetched on
  selection" pattern `list-artifacts`/`run-artifact` already established.
  - `status` is `result.status` lifted to the top level, so the list can
    show a badge without the caller re-deriving it.
  - `timestamp`: use the run directory's filesystem mtime
    (`fs.statSync(runDir).mtimeMs`), **not** a substring parsed out of
    `runId`. `runId` is `<capabilityId>.<sanitized-ISO-timestamp>`, and
    `capabilityId` itself contains dots (`bank.member.savings-lookup`) —
    splitting it back apart to find the timestamp is unnecessary string
    parsing for something the filesystem already tells you directly. Sort
    the list newest-first by this timestamp.
  - A folder with a missing or unparsable `result.json` is skipped from
    the list, not surfaced as a crash — this mirrors how `list-artifacts`
    already handles a broken JSON file, but note the difference: a broken
    *evidence* record isn't actionable to an operator the way a broken
    *artifact* is (they didn't author it), so it's fine to just omit it
    silently rather than showing a "could not parse" row. Log it to the
    main process console for developer visibility, nothing more.
- **`ipcMain.handle('get-evidence-run', runDir)`** — given a `runDir`
  from the list above:
  - Re-read that run's `result.json` in full (`params`, `result`, `log`,
    `screenshotPath`).
  - Base64-encode `screenshot.png` into a `screenshotDataUrl`, same as
    `run-artifact` does today.
  - Attempt to re-read the artifact at the recorded `artifactPath` to
    recover `outputs`/`businessOutcomes` (for output labels/redaction)
    and `capabilityId`/`description` (for the header). **The artifact
    file may no longer exist, or may have changed since the run** — this
    is expected, not an error condition, for anything but the newest
    runs. If it can't be read/parsed, return the evidence record with
    `artifact: null` rather than failing the whole call; §5 covers the
    renderer's fallback.
  - Return `{ evidence, artifact, screenshotDataUrl }`.
- Add both to `preload.cjs`'s existing `contextBridge.exposeInMainWorld('replayApi', ...)` object and to the `ReplayApi` type in
  `console/src/lib/api.ts` — extend the one bridge, don't create a second
  one.

---

## 3. Deliverable 1 — Tab navigation

- Add a two-tab switcher, **Run** and **Log**, at the top of the app
  shell (`App.tsx`), using shadcn's `Tabs` component (`@radix-ui/react-tabs`
  + the existing `class-variance-authority`/Tailwind pattern already used
  for this project's other hand-placed shadcn components — see
  `console/README.md`'s note on why `shadcn init` isn't used directly).
- The existing picker/form/result state machine becomes the content of
  the **Run** tab, unmodified in behavior. Switching to **Log** and back
  must not discard in-progress state on the Run tab (a filled-in form, a
  just-completed result) — the tab switch shows/hides content, it doesn't
  unmount it.
- The **Log** tab's evidence list (§4) re-fetches from
  `list-evidence-runs` every time it becomes the active tab, not only on
  first mount — so a run just completed on the Run tab shows up in the
  log without restarting the app. A manual "Refresh" button is a
  reasonable addition but the on-tab-focus refetch is the requirement,
  not optional.

**Acceptance:** the app opens on the Run tab by default (unchanged
behavior from `1_CONSOLE_SPEC.md`); clicking **Log** shows the evidence
list; clicking back to **Run** preserves whatever screen/state was there
before switching.

---

## 4. Deliverable 2 — Evidence list view

- Calls `list-evidence-runs` and renders one row per run, newest first
  (per §2's mtime-based sort), each showing:
  - capabilityId, formatted for readability the same way the artifact
    picker already does (`formatCapabilityId()` from `src/lib/utils.ts`
    — reuse it, don't reformat differently here).
  - a status badge using the shared `statusMeta()` extracted in §1
    (same colors/icons/labels as the Run tab's result view — an operator
    should recognize "green success / blue business outcome / red
    failure" as the same visual language in both tabs).
  - a human-readable relative or absolute timestamp (derived from the
    `timestamp` field §2 returns).
  - `capabilityVersion`.
- A simple client-side text filter (matches against `capabilityId`) above
  the list — no server round-trip needed, the full list is already in
  memory.
- Empty state: if `evidence/` has no runs yet, say so plainly (e.g. "No
  runs yet — results will appear here after you run an artifact"), don't
  show a blank pane.
- Clicking a row opens its detail (§5).

**Acceptance:** after running the happy-path, business-outcome, and
hard-failure demo artifacts from the root `README.md`'s demo path (in
any order, across one or more app sessions), switching to the Log tab
shows all three as separate rows with visibly distinct status badges,
newest-first.

---

## 5. Deliverable 3 — Evidence detail view

- Selecting a row calls `get-evidence-run` with its `runDir` and renders
  the result using `ResultView`, reusing the component from the Run tab
  rather than building a second renderer for the same three-way result
  shape. This requires adjusting `ResultView`'s props slightly:
  - Its `artifact` prop must become optional — when `get-evidence-run`
    returns `artifact: null` (the artifact file was moved/edited/deleted
    since the run), `ResultView` should fall back to showing each output
    by its raw key name with no description and no `sensitive`-driven
    masking beyond what's already baked into the stored `result` (recall
    `run()` already redacts sensitive params before writing evidence, but
    *output* values are **not** redacted at rest — masking in the UI
    today depends entirely on matching the live artifact's `OutputSpec.sensitive`, so if the artifact can't be loaded, mask nothing extra and
    show the header capabilityId from the evidence record's own
    `capabilityId` field instead of `artifact.capabilityId`).
  - Its `onRunAgain`/`onChooseDifferent` callbacks (Run-tab-specific
    actions — "run this exact artifact again", "go back to the picker")
    don't make sense for a historical record. Replace them for this
    context with a single `onBack` (returns to the list) — either add a
    `mode: 'live' | 'history'` prop that swaps the footer buttons, or
    split the footer buttons out of `ResultView` into a prop the caller
    supplies. Pick whichever keeps `ResultView` simplest; don't
    over-engineer a generic footer-slot system for two call sites.
  - Screenshot rendering already goes through a `screenshotDataUrl` field
    on the object passed in — `get-evidence-run`'s response supplies this
    the same way `run-artifact` does, so no change needed there.
- A visible affordance to go back to the list (`onBack` above).

**Acceptance:** opening a past success run shows the same outputs/
screenshot/log an operator would have seen right after running it live;
opening a past run whose artifact file has since been deleted or edited
still renders without crashing, using the fallback described above.

---

## 6. Out of scope reminders (do not build yet)

- No editing or deleting evidence records from the UI — `evidence/` stays
  something only `run()` writes to and `npm run clear-evidence` clears.
- No live-updating list while a run is in progress on the Run tab — the
  on-tab-focus refetch from §3 is sufficient; don't add file-watching or
  push updates over IPC for this.
- No pagination, virtualization, or lazy-loading of the list itself —
  `evidence/` stays small enough in this project's scope that reading it
  fully on each tab focus is fine.
- No server-side or fuzzy search — the client-side substring filter in
  §4 is enough.
- No "re-run this exact evidence record" button. It's a natural next
  step (jump to the Run tab with the artifact and — where still
  possible — params pre-filled) but isn't required here; stub it as a
  TODO comment if it falls out naturally, don't build the pre-fill
  plumbing now.
- No changes to how `run()` or `engine.ts` write evidence — this spec is
  purely a new read path over the existing format.

If something in Deliverables 2–3 clearly wants one of the above, stub it
as a TODO comment and move on rather than building it now.
