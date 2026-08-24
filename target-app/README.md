# Mock Legacy Bank App — Build Spec

## Purpose
This is a deliberately "legacy" server-rendered web app standing in for a bank
back-office tool with no API. It exists to be automated by a separate computer-use
agent project, so it must be realistically hostile: no test IDs, table-based
layout, iframes, and injectable runtime error states.

## Stack
- Node.js + Express (or plain http server), server-rendered HTML (EJS/plain templates)
- No frontend framework, no build step — old-school multi-page app
- SQLite or in-memory store for "members" and "accounts" data
- Runs locally on a fixed port, no auth needed (mock only)

## Global constraints (apply everywhere)
- No `data-testid`, `id`, or `name` attributes on interactive elements unless
  explicitly specified below. Legacy apps don't have them — don't accidentally
  make this easy to automate.
- Use `<table>`-based layout for all list/detail views, not CSS grid/flexbox.
- No semantic HTML5 tags (`<nav>`, `<main>`, etc.) — use `<div>`/`<table>` soup,
  like a page built in 2008.
- Every page must still be reachable via a real accessibility tree (roles, labels
  via visible text) even though the markup is ugly — screen-reader users existed
  in 2008 too. Buttons should be real `<button>` or `<input type=submit>`, not
  `<div onclick>`, so role-based locators are viable in principle, just not easy.
- Add a `?slow=true` query param support globally that adds a 2-4s artificial
  delay before rendering, to test wait/checkpoint logic.
- Add a `?fail=<code>` query param support on key actions to deterministically
  inject specific error states (see Error Injection below) — this is how the
  automation project will produce reproducible failure-path evidence.

## Page flow

### 1. Login shell (top-level, outside iframe)
- Simple username/password form (any credentials work, no real auth).
- On submit, redirect to `/dashboard`.
- Include a session timeout simulator: after a configurable idle period
  (or via `?fail=session_timeout`), any subsequent action anywhere in the app
  redirects to a "Session Expired" interstitial page requiring re-login.

### 2. Dashboard shell (top-level frame)
- A persistent top-level page containing:
  - A header/nav table (plain links, no test IDs)
  - A **main content iframe** (`<iframe>` with NO `name` or `id` attribute —
    distinguishable only by position in the page, e.g. it's the only iframe
    directly under the second `<table><tr><td>`)
- All actual work (search, detail, forms) happens inside that iframe.

### 3. Member search (inside main iframe)
- A form: text input for "Member ID or Last Name" + submit button, no labels
  via `<label for>` — use visible adjacent text instead (tests text-based
  role location, not label-linked location).
- Results rendered as a `<table>` with no `id`/class on rows, columns:
  Member ID | Name | Branch | Status.
- Include a business-outcome case: searching a nonexistent ID (e.g. "99999")
  returns a real "No records found" row/message — not an HTTP error, not a
  crash. This is the canonical "business outcome, not failure" case from the
  brief.
- Each result row's "Member ID" cell links to the detail page — but rather than
  a normal `<a href>` per row with the ID embedded cleanly, make the link submit
  a tiny form (POST) so the target isn't visible in a plain `href` — forces
  row-relative anchoring (e.g. "the button in the row whose first cell equals
  {memberId}") instead of naive CSS selection.

### 4. Member detail (inside main iframe, replaces search results via
    partial page load — the outer page/iframe URL does NOT change, only the
    iframe's internal content updates)
- Shows member info in a table: Name, Branch, Status, current Savings Balance.
- Contains a **nested iframe** for "Sub-Accounts" (an iframe within the main
  iframe) — this nested iframe has no name/id either, but can be identified
  by a heading element ("Sub-Accounts") immediately preceding it, or by being
  the only iframe within a specific enclosing `<div>`.
- Include a "New Sub-Account" button inside that nested iframe.

### 5. New sub-account form (inside the nested iframe)
- Fields: Account Type (select dropdown, options: Savings/Checking/CD),
  Initial Deposit (number input), Confirm checkbox.
- Submit leads to a **confirmation screen that renders inside the SAME nested
  iframe only** — the parent page and outer iframe do not navigate or reload.
  This is the "checkpoint can't rely on URL, must rely on DOM/accessibility
  state" stress case.
- This action should be tagged conceptually as the "risky/irreversible" step
  in the flow (creates a real record) — build it so a real confirmation step
  exists (a distinct "Confirm Creation" button after a review screen showing
  entered values), not a single-click submit. Two-step confirm supports testing
  a "require confirmation" guardrail policy.

### 6. Error injection support (for deterministic negative-path testing)
Support these via `?fail=` on the relevant POST/GET endpoint:
- `fail=not_found` — member search returns "No records found" (business outcome)
- `fail=validation` — sub-account form submit returns a validation error message
  inline (e.g. "Initial deposit must be positive") without navigating away
  (recoverable — fix and resubmit)
- `fail=permission_denied` — detail page returns a "You do not have permission
  to view this member" message instead of data (recoverable via escalation,
  or hard business outcome — your caller's choice)
- `fail=session_timeout` — forces the session-expired interstitial on next action
- `fail=unexpected_dialog` — sub-account confirm triggers a native
  `window.confirm()` JS dialog before proceeding (tests interstitial-dismissal
  handling)
- `fail=server_error` — returns a generic 500-style error page (hard failure)
- `fail=slow` — alias for the `?slow=true` delay behavior, for timeout/wait testing

## Explicit non-goals
- No real authentication/security — this is a local mock only, never deploy
- No persistence beyond the local dev DB — resettable via a `/reset` endpoint
  that restores seed data (a handful of sample members)
- No responsive/mobile styling — desktop-only, fixed-width tables is fine and
  authentic to the target era

## Seed data
Provide ~5-10 sample members with varied names, branches, and statuses
(at least one "closed" or "restricted" status member to exercise permission/
business-outcome cases), reachable by both exact ID and partial last-name search.

## Acceptance check
After building, manually verify:
1. The main content iframe has no `name`/`id` and is only identifiable by
   position/structure.
2. The sub-accounts iframe is nested inside it and also has no `name`/`id`.
3. Submitting the sub-account form updates only the innermost iframe's DOM —
   confirm via browser devtools that the parent frame's `location` never changes.
4. Every `?fail=` variant actually produces the described state and can be
   triggered reproducibly.
5. `/reset` restores clean seed data.