# Step 0 — flow selection notes

## What the mock app looks like

`target-app/` (built earlier from `target-app/BUILD-SPEC.md`) is a deliberately
legacy, server-rendered Express + EJS bank back-office app:

- No `data-testid`/`id`/`name` on anything that would make selection easy.
  Form fields carry opaque `name`s (`u`, `p`, `q`, `type`, `deposit`) only
  because HTML requires *some* `name` to submit — nothing meaningful.
- `<label for>` is never used. Field identity is conveyed only by adjacent
  `<td>` text in a table layout ("Member ID or Last Name:", "Username:").
- All real content lives inside an unlabeled `<iframe>` (`/app/search`,
  loaded from `/dashboard`), identifiable only by being the sole iframe
  under the second top-level `<table><tr><td>`. A second, nested,
  equally unlabeled iframe exists one level deeper for sub-accounts.
- Member-row "links" are `<button type=submit>` inside a one-row `<form
  method=POST>`, not `<a href>` — so a row has to be found by "the button
  in the row whose first `<td>` equals `{id}`", not by inspecting an href.
- Runtime states are real, not simulated: `/app/search?q=99999` (or
  `?fail=not_found`) returns a genuine "No records found" row — an HTTP
  200, not an error. `?slow=true` adds a real 2-4s server-side delay.
  `?fail=session_timeout` / `permission_denied` / `validation` /
  `unexpected_dialog` / `server_error` are real, reproducible server
  behaviors, not mocks bolted onto the harness.

## Flow chosen: member search → member detail (extract Savings Balance)

This is the assignment's own example goal ("look up member 12345 and read
their current savings balance"). Concretely: log in → land on the
dashboard (main iframe auto-loads `/app/search`) → search by exact member
ID → click into that member's detail row → read the Savings Balance cell.

It has, **already present in the app, with no additions needed**:

- **A value to extract** — the Savings Balance cell on the detail page.
- **A reachable business-outcome state** — searching a nonexistent ID
  returns "No records found" as a normal 200 page, not a crash. This is
  the textbook "business outcome, not failure" case the assignment calls
  out by name.
- **A reachable recoverable/transient state** — the app's real `?slow=`
  behavior is used to model "wait/retry a transient load" (one of the two
  recoverable examples the assignment gives, alongside "dismiss a known
  interstitial"). The artifact declares `slow` as a real, typed boolean
  parameter; when true it's templated into the search navigation's query
  string, so the *same* recorded flow exercises the recoverable path
  deterministically instead of relying on a fake/injected condition.

## Why not the sub-account creation flow

`target-app` also has a genuine dismissible interstitial
(`?fail=unexpected_dialog` triggers a real `window.confirm()` before the
two-step "Confirm Creation") and a validation-error recoverable case. That
flow is a stronger showcase of *interstitial dismissal* specifically, but
it requires resolving locators through **two** nested iframes plus native
dialog handling, on top of everything the search→detail flow already
exercises. Given this deliverable's scope is "prove the schema is sound
with a minimal harness," not "cover every error mode," I scoped the first
hand-authored artifact to search→detail and left the sub-account flow as
the natural next artifact (see `REPORT.md` cuts, once written). The type
design (`frame?: LocatorSpec[]` as an arbitrary-depth chain, and
`RecoveryHint.action: 'dismissDialog'`) already anticipates it — it just
isn't exercised by this fixture.

## §4 — mock-app additions

**Skipped.** The existing app already reaches a real business-outcome
state (not-found search) and a real recoverable/transient state (slow
load) without modification. No changes were made to `target-app/` for
this deliverable.
