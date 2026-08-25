# interface.ai-project

This repo currently implements `ARTIFACT_BUILD_SPEC.md`: the capability-artifact
schema plus a minimal deterministic replay harness, proved out against the
mock legacy bank app in `target-app/`. See `ASSIGNMENT.md` for the full
project context this is scoped from, and `docs/step0-flow-notes.md` for why
the search→detail flow was chosen and why no mock-app changes were needed.

## Layout

- `target-app/` — the target: a deliberately legacy, server-rendered mock
  bank back-office app (Express + EJS, table layout, no test IDs/ids/names,
  nested unlabeled iframes, real business-outcome/slow/error-injection
  states). See `target-app/BUILD-SPEC.md`.
- `src/types/capability-artifact.ts` — the artifact schema (TypeScript types).
- `src/types/artifact-schema.zod.ts` — the runtime validator, including
  cross-field checks (dangling `{{param}}` refs, outputs never produced,
  recoverable steps with no recovery hint, empty locator rationale).
- `src/replay/engine.ts` — the deterministic replay engine (locator
  fallback-chain resolution, recovery hints, business-outcome-before-
  checkpoint ordering, sensitive-field redaction).
- `src/replay/run.ts` / `src/replay/validate-only.ts` — CLIs.
- `artifacts/test/member-savings-lookup.json` — the hand-authored test artifact.
- `artifacts/test/broken/` — deliberately-invalid fixtures used to prove the
  validator's cross-field checks.
- `evidence/` — one folder per replay run (`evidence/<runId>/`), each
  containing `result.json` (result + step log) and `screenshot.png` —
  both written for every run regardless of outcome — including one run
  of each required outcome.

## Setup

Requires Node.js 18+.

```bash
# from the repo root
npm install
npx playwright install chromium

# in a second terminal: start the target app the artifact points at
cd target-app
npm install
npm start          # listens on http://localhost:4000
```

## Demo path

With `target-app` running on port 4000:

```bash
# 1. Validate the hand-authored artifact (no browser involved)
npx tsx src/replay/validate-only.ts artifacts/test/member-savings-lookup.json

# 2. Replay it: happy path
npx tsx src/replay/run.ts artifacts/test/member-savings-lookup.json \
  memberId=1001 username=demo.operator password=demo123
# -> {"status":"success","outputs":{"savingsBalance":5230.5}}

# 3. Replay it: business-outcome path (nonexistent member, not a crash)
npx tsx src/replay/run.ts artifacts/test/member-savings-lookup.json \
  memberId=99999 username=demo.operator password=demo123
# -> {"status":"business_outcome","outcome":"member_not_found",...}

# 4. Replay it: recoverable path (real 2-4s server delay, deterministic retry)
npx tsx src/replay/run.ts artifacts/test/member-savings-lookup.json \
  memberId=1002 username=demo.operator password=demo123 slow=true
# -> {"status":"success",...} — see the evidence log for the recovery attempt

# 5. Hard failure (stop target-app first, or use the broken-locator demo fixture)
npx tsx src/replay/run.ts artifacts/test/member-savings-lookup.demo-broken-locator.json \
  memberId=1001 username=demo.operator password=demo123
# -> {"status":"failure","stepId":"extract_savings_balance",...}
```

Every run writes its own `evidence/<runId>/` folder containing `result.json`
(structured result + step log) and `screenshot.png` — both always written,
whatever the outcome — redacting anything the artifact marks `sensitive`
(here: `username`/`password`).

Run the automated test suite (schema validation + live-browser replay against
a locally spawned `target-app`):

```bash
npm test
```

## Validating a broken artifact

```bash
npx tsx src/replay/validate-only.ts artifacts/test/broken/missing-rationale.json
npx tsx src/replay/validate-only.ts artifacts/test/broken/dangling-param-reference.json
npx tsx src/replay/validate-only.ts artifacts/test/broken/recoverable-without-hint.json
```

Each fails with a specific, per-field message rather than a generic parse
error.

## Clearing evidence

```bash
npm run clear-evidence
```

Removes everything inside `evidence/` (keeping the directory itself), for
starting a fresh demo recording.
