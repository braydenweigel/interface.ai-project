# Capability-artifact schema

This documents the artifact format defined in
[`src/types/capability-artifact.ts`](../src/types/capability-artifact.ts)
(TypeScript types — the source of truth for shape) and
[`src/types/artifact-schema.zod.ts`](../src/types/artifact-schema.zod.ts)
(the runtime validator, including checks the type system alone can't
express). See `ARTIFACT_BUILD_SPEC.md` §2 for the original spec this
implements, and [`step0-flow-notes.md`](step0-flow-notes.md) for why the
one hand-authored artifact in this repo looks the way it does.

## What this is

A capability artifact is a recorded, typed, replayable UI flow — the
output of a (future) LLM discovery run, or in this repo's case a
hand-authored stand-in for one. It's meant to be read two ways at once:

- **By a human reviewer**, who needs to understand what the capability
  does, what it needs, what it returns, and why each element is targeted
  the way it is, without re-running it.
- **By the deterministic replay engine** (`src/replay/engine.ts`), which
  needs enough structure to drive a real browser without a model in the
  loop and to tell apart three fundamentally different outcomes: success,
  an expected non-success business outcome, and a hard failure.

Everything below exists to serve one of those two readers.

## Top-level shape

```ts
interface CapabilityArtifact {
  schemaVersion: string;       // format version, not the capability's own version
  capabilityId: string;        // stable id, e.g. "bank.member.savings-lookup"
  version: number;              // this capability's own revision
  description: string;
  target: CapabilityTarget;     // { appId, baseUrl, entryPath }
  parameters: ParamSpec[];      // typed inputs the caller supplies
  outputs: OutputSpec[];        // typed data the caller gets back
  steps: ArtifactStep[];        // the ordered, recorded actions
  checkpoint: Checkpoint;       // the success condition
  businessOutcomes: BusinessOutcome[]; // expected non-success terminal states
  riskClass: 'safe' | 'reversible' | 'irreversible';
  provenance: Provenance;       // createdAt, createdBy, sourceRunId?, reviewedBy?
}
```

`schemaVersion` and `version` are deliberately separate: `schemaVersion` is
the artifact *format's* version (this document); `version` is this
particular capability's own revision history, independent of format
changes.

## Locators: fallback chains, not selectors

The single idea this schema is built around: **a locator is never one
selector, it's an ordered list of strategies with a required
justification for the ordering.**

```ts
type LocatorStrategy =
  | { kind: 'role'; role: string; name?: string; exact?: boolean }
  | { kind: 'testId'; testId: string }
  | { kind: 'label'; label: string; exact?: boolean }
  | { kind: 'text'; text: string; exact?: boolean }
  | { kind: 'css'; selector: string }
  | { kind: 'xpath'; expression: string };

interface LocatorSpec {
  strategies: LocatorStrategy[];   // tried in order; first visible match wins
  robustnessRationale: string;     // required, >= 15 chars, must be specific
}
```

The replay engine (`resolveLocatorSpec` in `engine.ts`) tries each
strategy in turn against a divided share of the step's timeout budget, and
uses the first one that resolves to a *visible* element. `role` and
`testId` and `label` are the strategies you'd reach for on a modern app;
`text` and structural `css`/`xpath` are what's left once a legacy surface
has none of those (see the hand-authored artifact's login-field locators,
which fall back to "the `<td>` whose text is `'Username:'`, then its
sibling `<td>`'s input" because the field has no label, id, or
distinguishing accessible name at all).

`robustnessRationale` is not decorative. The validator rejects anything
under 15 characters, and — per `ARTIFACT_BUILD_SPEC.md` — a rationale that
doesn't reference the actual markup it's targeting is a reviewer-visible
smell even though the schema can't mechanically detect that. Write it as
"why this ordering, given what's actually on the page," not "css
selectors can break."

### Frames

Because legacy surfaces nest content in unlabeled iframes, any step (plus
`Checkpoint` and `BusinessOutcome`) can carry an optional `frame:
LocatorSpec[]` — an ordered chain of iframe locators to descend into
before resolving the step's own locator. `frame` omitted or `[]` means
"top-level document." Each entry is a full fallback-chain `LocatorSpec`
in its own right, because an unlabeled iframe needs exactly the same
"how do I robustly find this thing" treatment as any other element. The
engine resolves each frame-chain entry as a normal element locator, then
calls Playwright's `locator.contentFrame()` to descend — so a two-level
chain (iframe inside iframe) works the same way as one level, it's just
not exercised by the current hand-authored artifact (see
`step0-flow-notes.md` for why).

## Parameters, outputs, and template substitution

```ts
type ParamType = 'string' | 'number' | 'boolean' | 'currency' | 'date';

interface ParamSpec {
  name: string;
  type: ParamType;
  required: boolean;
  description: string;
  sensitive: boolean;   // redact this value from results and logs
}

interface OutputSpec {
  name: string;
  type: ParamType;
  description: string;
  sensitive: boolean;
}
```

A step's `value` (the URL for `navigate`, the text for `fill`) — and, in
practice, any string field on a step's locators — can reference
`{{paramName}}`, substituted at replay time, plus the built-in
`{{baseUrl}}` (from `target.baseUrl`, not a declared parameter). The
validator's `checkTemplateReferences` walks *every* string in the
artifact looking for `{{...}}` tokens and rejects any that don't
correspond to a declared parameter — not just the `value` fields the spec
calls out, since a row-relative xpath like
`//tr[td[1][normalize-space(.)='{{memberId}}']]//button` is just as much
a template reference as a fill value.

A field marked `sensitive: true` (parameter or output) is redacted as
`[REDACTED]` everywhere a result can be observed: the returned
`ReplayResult`, the evidence log entries, and the JSON written to
`evidence/<runId>/result.json`. See the hand-authored artifact's
`username`/`password` parameters for the pattern.

Every declared `output` must actually be produced — the validator's
`checkOutputsAreProduced` requires some step with `action: "extract"` and
a matching `outputName`. There's no such requirement for
`BusinessOutcome.outputs` (see below) — those are populated differently.

## Steps

```ts
type StepAction = 'navigate' | 'fill' | 'click' | 'waitFor' | 'extract';
type FailureClass = 'hard' | 'recoverable';

interface ArtifactStep {
  id: string;                 // unique within the artifact
  action: StepAction;
  description: string;
  frame?: LocatorSpec[];
  locator?: LocatorSpec;      // required for fill/click/waitFor/extract
  value?: string;             // required for fill (text to type) / navigate (URL)
  outputName?: string;        // required for extract
  timeoutMs: number;
  onFailure: FailureClass;
  recoveryHints?: RecoveryHint[]; // required (non-empty) when onFailure === 'recoverable'
}
```

The zod schema enforces the action/field pairing above via `superRefine`
(not just optional-field shape) — e.g. a `fill` step with no `value`, or
an `extract` step with no `outputName`, fails validation with a message
naming the offending step id.

### Recoverable steps

```ts
interface RecoveryHint {
  name: string;
  detector: string;   // prose: the condition that triggers this hint
  action: 'retry' | 'retryWithExtendedTimeout' | 'reload' | 'dismissDialog' | 'custom';
  maxAttempts: number; // bounds it — recovery can never become an unbounded loop
  extendedTimeoutMs?: number; // used by retryWithExtendedTimeout
  note?: string;
}
```

`onFailure: "recoverable"` without at least one `RecoveryHint` fails
validation — this is one of the three "deliberately broken" acceptance
fixtures under `artifacts/test/broken/`. See the hand-authored artifact's
`navigate_login` step for a real, deterministic use of this: the mock
app's `?slow=true` testing hook adds a genuine 2-4s delay, the step's own
`timeoutMs` (1500) is deliberately shorter than that, and the
`retryWithExtendedTimeout` hint's `extendedTimeoutMs` (6000) comfortably
covers the worst case — so the recoverable path is exercised for real, not
simulated, and never flakes in either direction.

## Checkpoint vs. BusinessOutcome — the important distinction

```ts
interface ExpectationSpec {
  kind: 'visible' | 'textContains';
  text?: string;   // required when kind === 'textContains'
}

interface Checkpoint {
  description: string;
  frame?: LocatorSpec[];
  locator: LocatorSpec;
  expectation: ExpectationSpec;
}

interface BusinessOutcome {
  name: string;
  description: string;
  frame?: LocatorSpec[];
  detector: LocatorSpec;
  expectation: ExpectationSpec;
  outputs?: OutputSpec[];
}
```

`Checkpoint` is the success condition — it confirms the flow actually
reached the expected state, not just that every click resolved without
throwing. `BusinessOutcome` is a **first-class sibling** of `Checkpoint`,
not an exception path: a named, expected *non-success* terminal state
(e.g. `"member_not_found"` when a search legitimately turns up nothing).
Conflating the two — treating "no such member" as a failure instead of a
real answer — is, per `ARTIFACT_BUILD_SPEC.md`, the most common design
mistake here.

The engine reflects this in its control flow (`replay()` in
`engine.ts`): whenever a step fails to resolve, **all declared
`businessOutcomes` are checked before the step is reported as a
failure**, and the same check runs again after all steps complete,
before the checkpoint is evaluated. So an expected non-match is never
misreported as a broken flow, no matter which step it interrupts.

A `BusinessOutcome` with declared `outputs` doesn't need a matching
`extract` step (unlike top-level `outputs`) — the engine reads the
outcome's own `detector` element's text as the value for a single
declared output. See the hand-authored artifact's `member_not_found`
outcome, whose `message` output is just the "No records found." text the
detector itself matched.

## Risk class and provenance

```ts
type RiskClass = 'safe' | 'reversible' | 'irreversible';

interface Provenance {
  createdAt: string;
  createdBy: string;
  sourceRunId?: string;   // the discovery run this was recorded from, if any
  reviewedBy?: string;
}
```

`riskClass` is metadata for a guardrail layer this deliverable doesn't
build (see `ARTIFACT_BUILD_SPEC.md` §6 — out of scope here, stubbed as a
TODO in `engine.ts`). The hand-authored artifact is `"safe"` (a read-only
lookup); an artifact that creates a real record (e.g. the mock app's
sub-account creation flow) would be `"irreversible"` and, in a later
phase, gated behind an approval/confirmation policy before unattended
replay.

## Validation

`validateArtifact(data: unknown): ValidationResult` in
`artifact-schema.zod.ts` is the single entry point both CLIs use. It
layers:

1. **Shape** — every field above, mirrored field-for-field as zod
   schemas, including the discriminated union over `LocatorStrategy.kind`.
2. **Cross-field**, via `superRefine`, none of which shape validation
   alone can express:
   - every `{{param}}` reference anywhere in the artifact resolves to a
     declared parameter (`checkTemplateReferences`),
   - every declared top-level output is produced by some `extract` step
     (`checkOutputsAreProduced`),
   - every step id is unique (`checkStepIdsUnique`),
   - a `recoverable` step has at least one `RecoveryHint`,
   - the action/field pairing per step (`fill`→`value`, `navigate`→
     `value`, `extract`→`outputName`, everything but `navigate`→
     `locator`),
   - `robustnessRationale` is present and specific (>= 15 chars) on
     *every* `LocatorSpec` in the artifact, including nested `frame`
     chains, `Checkpoint.locator`, and `BusinessOutcome.detector`,
   - `expectation.kind === 'textContains'` requires a non-empty `text`.

Every failure carries a specific `path` (e.g. `steps.0.recoveryHints`,
`outputs.0.name`) and a message naming what's wrong — never a bare parse
failure. `npx tsx src/replay/validate-only.ts <artifact.json>` runs this
with no browser involved, for fast iteration while hand-authoring; the
three fixtures under `artifacts/test/broken/` each isolate one of these
checks and are asserted against in `src/test/schema.test.ts`.

## Worked example

Excerpt from `artifacts/test/member-savings-lookup.json` — a `fill` step
targeting a legacy login field with no id/name/label, only adjacent table
text to anchor to:

```json
{
  "id": "fill_username",
  "action": "fill",
  "description": "Type the operator username into the login form's first field.",
  "locator": {
    "strategies": [
      {
        "kind": "xpath",
        "expression": "//td[normalize-space(text())='Username:']/following-sibling::td[1]/input"
      }
    ],
    "robustnessRationale": "login.ejs has no <label for>, id, or name that identifies this field semantically (the input's own name attribute is the opaque 'u'). The only stable signal is the table layout itself: a <td> containing the literal text 'Username:' immediately followed by a sibling <td> holding the input. There's no second, equally valid strategy here because there's genuinely nothing else on the page to anchor to (role+name resolves to an unnamed textbox shared with the password field, since neither has an accessible name) -- the positional xpath is the only reliable signal, which is itself the point of this fixture."
  },
  "value": "{{username}}",
  "timeoutMs": 5000,
  "onFailure": "hard"
}
```

See the full file for the complete flow (login → search → row-relative
click → extract), its one `businessOutcome` (`member_not_found`), and its
deterministic use of a `recoverable` step against the mock app's real
slow-load behavior.

## Where this is used

- `src/types/capability-artifact.ts` / `artifact-schema.zod.ts` — this
  document's source of truth.
- `src/replay/engine.ts` — the deterministic replay engine that consumes
  a validated artifact.
- `src/replay/run.ts` / `validate-only.ts` / `repl.ts` — CLIs and a
  programmatic entry point (`run(artifactPath, params)`) built on top.
- `artifacts/test/` — the one hand-authored artifact plus the three
  deliberately-broken validation fixtures.
