# BUILD_SPEC.md — Artifact Schema + Test Harness

## 0. Scope

Build, from scratch, two things:
1. The capability-artifact schema — the typed contract for a recorded,
   reusable, replayable UI flow (assignment §3.2).
2. A minimal test harness that proves the schema is sound by replaying a
   hand-authored artifact, deterministically, against the mock app that
   **already exists** in this repo.

**Explicitly out of scope:** the LLM discovery loop, guardrails/allowlist
enforcement, escalation & handoff, and the full runtime error taxonomy.
Don't build any of those now, even if they seem like natural next steps —
stay inside this scope. This phase produces the foundation those get
built on top of later.

Stack: TypeScript, Node, Playwright, Zod.

---

## 1. Step 0 — Inspect the existing mock app before designing anything

Do this first, don't skip it. The schema (especially locator design) has
to fit the actual app, not an assumed one.

- Find and read the mock app's source. Identify: what routes/screens it
  has, whether the markup has stable hooks (`data-testid`, `id`
  attributes) or is closer to legacy (table layout, no test IDs, generic
  divs/spans) — this materially changes what locator strategies are
  viable and worth prioritizing.
- Identify one existing multi-step flow (or the closest thing to one) in
  the app that has: a value to extract, a not-found/empty/error state
  that's reachable, and (if present) any interstitial or confirmation
  step. If the current app is single-screen or doesn't have a
  business-outcome path or a dismissible interstitial, note this — you
  may need to add a small amount to the mock app to make the schema
  fully testable (see §4), but the app itself is not what you're
  building here, keep additions minimal.
- Write a short note (a few lines, in code comments or a scratch file)
  summarizing the flow you'll target and why — this becomes the basis
  for the hand-authored artifact in §3.

---

## 2. Deliverable 1 — Schema definition

`src/types/capability-artifact.ts` — TypeScript types for:

- **Locators as fallback chains, not single selectors.** Each
  `LocatorSpec` is an ordered list of `LocatorStrategy` variants (role +
  accessible name, test-id, label, text, css, xpath), plus a required
  `robustnessRationale` string justifying the ordering for that specific
  element. This is the answer to "how does this survive a legacy surface
  with no test IDs" — don't collapse it to one selector per element, and
  don't write generic rationale text; it should reference the actual
  markup you found in Step 0.
- **Typed parameters and outputs** (`ParamSpec`, `OutputSpec`): name,
  type (`string | number | boolean | currency | date`), required/
  optional, description, and a `sensitive` flag for redaction.
- **Steps** (`ArtifactStep`): action (`navigate | fill | click | waitFor
  | extract`), a locator where relevant, a timeout, and a required
  `onFailure: "hard" | "recoverable"` classification. Recoverable steps
  carry named `RecoveryHint`s (a detector + an action + max attempts) —
  don't leave failure handling implicit.
- **Checkpoint**: the success condition — a locator plus an expectation
  (`visible` or `textContains`). Confirms the flow actually reached the
  expected state, not just that clicks completed without erroring.
- **BusinessOutcome**: a *first-class sibling* of the success checkpoint,
  not an exception path — a named, expected terminal state (e.g. "record
  not found") with its own detector and optional outputs. Conflating this
  with failure is the most common mistake the assignment calls out —
  don't make it.
- **Top-level `CapabilityArtifact`**: schema version, stable capability
  id, version number, target (appId/baseUrl/entryPath), parameters,
  outputs, steps, checkpoint, businessOutcomes, `riskClass: "safe" |
  "reversible" | "irreversible"`, and `provenance` (createdAt, createdBy,
  optional sourceRunId/reviewedBy).

`src/types/artifact-schema.zod.ts` — a runtime validator mirroring the
above. The TS types alone won't catch a malformed hand-authored JSON
file. Include cross-field checks, not just shape checks:
- every `{{param}}` template reference in a `fill`/`navigate` action
  corresponds to a declared parameter,
- every declared output is actually produced by some `extract` step,
- a step with `onFailure: "recoverable"` has at least one `RecoveryHint`,
- every `LocatorSpec` has a non-empty `robustnessRationale`.

**Acceptance:** a deliberately broken artifact (missing rationale,
dangling param reference, recoverable step with no recovery hint) fails
validation with a specific, per-field error message — not a generic
parse failure.

---

## 3. Deliverable 2 — Hand-authored test artifact(s)

At least one artifact JSON, hand-written (not generated), targeting the
flow identified in Step 0, conforming to the schema. It should cover:
- the happy path (fill/click/extract a real value),
- the business-outcome path if one exists in the app (or was added per
  §4),
- the interstitial/recoverable path if one exists (or was added per §4).

This is the fixture the test harness runs against — treat it as a real
test case, not a throwaway example.

**Acceptance:** validates cleanly against `artifact-schema.zod.ts` with
zero errors.

---

## 4. Deliverable 3 — Minimal mock-app additions (only if needed)

If Step 0 found the existing app has no reachable business-outcome state
or no interstitial/dismissible element, add the smallest possible
addition to exercise them — e.g. one route that returns a "not found"
state for an unrecognized input, or one banner that must be dismissed
before the main flow is usable. Do not otherwise modify or restructure
the existing mock app.

**Acceptance:** skip this section entirely if the existing app already
supports both cases — say so explicitly rather than adding unneeded
surface area.

---

## 5. Deliverable 4 — Test/replay harness

A minimal executor whose only job is: given a validated artifact + input
params, drive Playwright through the recorded steps and report which of
three outcomes occurred. Not a production-grade replay engine with full
guardrails/escalation — that's later work.

`src/replay/engine.ts`:
- resolves each `LocatorSpec` by trying its strategies in order (first
  one that resolves to a visible element wins) — this is what actually
  tests whether the fallback-chain design works, not just whether it
  compiles,
- on a step failure, if `onFailure: "recoverable"`, attempts the named
  recovery hint(s) before giving up,
- after all steps, checks declared `businessOutcomes` **before** the
  success `checkpoint`, so an expected non-success terminal state is
  never misreported as a failed checkpoint,
- returns a structured result: `{status: "success", outputs}` |
  `{status: "business_outcome", outcome, outputs}` |
  `{status: "failure", stepId, expected, observed}`,
- redacts any field marked `sensitive` (in params or outputs) before it
  appears in the returned result or any log line.

`src/replay/run.ts` — CLI: `run <artifact.json> key=value ...`, prints
the structured result, and writes it (plus a screenshot on failure) to
`/evidence`.

`src/replay/validate-only.ts` — CLI: schema-validate an artifact with no
browser involved, for a fast iteration loop while hand-authoring.

**Acceptance — run all three and confirm the result shape is correct:**
1. Valid params on the happy path → `status: "success"` with the correct
   extracted output value.
2. Params that trigger the business-outcome path → `status:
   "business_outcome"`, not `"failure"`.
3. A forced hard failure (stop the mock app, or point the artifact at a
   nonexistent element) → `status: "failure"` with a specific `stepId`
   and an `observed` value that would actually help someone debug it —
   not a bare stack trace.

---

## 6. Out of scope reminders (do not build yet)

- No LLM in this phase. The artifact under test is hand-authored; the
  discovery side that would eventually produce artifacts like this from
  a natural-language goal is separate future work.
- No allowlist/guardrail enforcement layer — this harness assumes the
  artifact is already trusted enough to run.
- No escalation/handoff — a hard failure here just returns a structured
  result and stops; there's no human-takes-control mechanism yet.
- No multi-tenant/desktop support — single mock app, single artifact
  format version, nothing generalized yet.

If something in Deliverables 1–4 clearly wants one of the above (e.g. you
find yourself wanting to gate a risky action), stub it as a TODO comment
and move on rather than building it now.